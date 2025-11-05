#!/usr/bin/env node
/**
 * Generate per-class JSON Schemas from PlantUML (.puml) with SCHEMAHINTS.
 *
 * Canonical $id / $ref for schemas:
 *   https://example.org/hatpro/<segment>/<subpath?>/<Class>.schema.json
 *
 * Enums:
 *   - enumFrom: "/core/common/ISO639_1"          → property $ref to existing enum JSON
 *   - enumDefine: { path, type, enum, ..., generate: true|false }
 *       → property $ref to enum JSON
 *       → write/overwrite enum JSON only if: --emitEnums true AND generate: true
 *
 * Usage:
 *   node tools/generate-json-from-puml.mjs --baseId https://example.org/hatpro/ [--emitEnums true]
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ------- repo root detection (robust) ------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
function findRepoRoot(startDir) {
  let cur = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(cur, "packages"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "packages"))) return cwd;
  return startDir;
}
const repoRoot    = findRepoRoot(path.resolve(__dirname, ".."));
const packagesDir = path.join(repoRoot, "packages");
/* -------------------------------------------- */

const args = process.argv.slice(2);
let baseId = "https://example.org/hatpro/"; // canonical default
let emitEnums = false;                       // global gate: default OFF

function parseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return false;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseId" && args[i + 1]) baseId = args[++i];
  else if (args[i] === "--emitEnums" && args[i + 1]) emitEnums = parseBool(args[++i]);
}
if (!baseId.endsWith("/")) baseId += "/";

/* ------------------------- small utils ------------------------- */
async function readText(p) { return fsp.readFile(p, "utf8"); }
async function writeJSON(p, obj) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(obj, null, 2), "utf8");
}
function walkPumlSync(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPumlSync(full));
    else if (entry.isFile() && /\.puml$/i.test(entry.name)) out.push(full);
  }
  return out;
}
function normalizeRelPath(s) {
  const out = [];
  for (const part of String(s).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return out.join("/");
}

/* ---------- schema $ref resolver (classes) ---------- */
function toAbsoluteRef(ref, ctx) {
  if (!ref) return ref;
  if (ref.startsWith("#") || /^https?:\/\//i.test(ref)) return ref;
  if (ref.startsWith("/"))  return baseId + ref.replace(/^\//, "") + ".schema.json";
  if (ref.startsWith("@"))  return baseId + ref.slice(1) + ".schema.json";
  if (ref.startsWith("./") || ref.startsWith("../")) {
    const rel = normalizeRelPath((ctx.subs.join("/")) + "/" + ref);
    return baseId + ctx.seg + "/" + rel + ".schema.json";
  }
  const rel = (ctx.subs.length ? ctx.subs.join("/") + "/" : "") + ref;
  return baseId + ctx.seg + "/" + rel + ".schema.json";
}

/* ---------- enum path resolver (external JSON) ---------- */
function parseEnumPathLike(pLike, ctx) {
  // Returns { seg, subs[], name, $id, fileAbs }
  if (!pLike) return null;

  let seg, subs = [], name;
  if (/^https?:\/\//i.test(pLike)) {
    const m = pLike.match(/\/hatpro\/(.+)\.json$/i);
    if (!m) return null;
    const parts = m[1].split("/");
    seg  = parts[0];
    name = parts[parts.length - 1];
    subs = parts.slice(1, -1);
  } else if (pLike.startsWith("/")) {
    const parts = pLike.replace(/^\//, "").split("/");
    seg  = parts[0];
    name = parts[parts.length - 1];
    subs = parts.slice(1, -1);
  } else if (pLike.startsWith("@")) {
    const parts = pLike.slice(1).split("/");
    seg  = parts[0];
    name = parts[parts.length - 1];
    subs = parts.slice(1, -1);
  } else if (pLike.startsWith("./") || pLike.startsWith("../")) {
    const rel = normalizeRelPath((ctx.subs.join("/")) + "/" + pLike);
    seg  = ctx.seg;
    const rparts = rel.split("/");
    name = rparts[rparts.length - 1];
    subs = rparts.slice(0, -1);
  } else {
    // bare name → same folder
    seg  = ctx.seg;
    subs = ctx.subs.slice();
    name = pLike;
  }

  const $id     = baseId + [seg, ...subs, name].join("/") + ".json";
  const fileAbs = path.join(repoRoot, "packages", seg, "json", "enums", ...subs, `${name}.json`);
  return { seg, subs, name, $id, fileAbs };
}

/* ------------------------- parsing hints ------------------------- */
function extractBlocks(src) {
  const blocks = [];
  const re = /note\s+(?:left|right|top|bottom)?\s+of\s+([A-Za-z0-9_]+)\s*[\r\n]+([\s\S]*?)end\s+note/gi;
  let m;
  while ((m = re.exec(src))) {
    const cls = m[1];
    const body = m[2];
    if (/^\s*SCHEMAHINTS\b/i.test(body)) blocks.push({ name: cls, body });
  }
  return blocks;
}

function parseHints(body) {
  // small/tolerant parser; expects leading "SCHEMAHINTS"
  const lines = body.split(/\r?\n/).slice(1);
  const hints = { fields: {}, required: [] };
  let currentField = null;

  const pushField = (k) => { hints.fields[k] ||= {}; currentField = k; };

  for (let raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim()) continue;

    // field <name>:
    const mField = line.match(/^\s*field\s+([A-Za-z0-9_]+)\s*:\s*$/i);
    if (mField) { pushField(mField[1]); continue; }

    // top-level: title:
    const mTitle = line.match(/^\s*title\s*:\s*(.+)\s*$/i);
    if (mTitle) { hints.title = mTitle[1].trim(); continue; }

    // top-level: required: [a, b, c]
    const mReq = line.match(/^\s*required\s*:\s*\[(.*?)\]\s*$/i);
    if (mReq) {
      const items = mReq[1].split(",").map((s) => s.trim()).filter(Boolean);
      hints.required.push(...items);
      continue;
    }

    // field-level entries
    if (currentField) {
      const kv = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+)\s*$/);
      if (kv) {
        let [, k, v] = kv;
        v = v.trim();

        // YAML-like array
        if (/^\[.*\]$/.test(v)) {
          const arr = v.replace(/^\[/, "").replace(/\]$/, "")
            .split(",").map((s) => s.trim()).filter(Boolean);
          hints.fields[currentField][k] = arr; continue;
        }
        // booleans / numbers
        if (/^(true|false)$/i.test(v)) { hints.fields[currentField][k] = /^true$/i.test(v); continue; }
        if (/^-?\d+(\.\d+)?$/.test(v)) { hints.fields[currentField][k] = Number(v); continue; }

        hints.fields[currentField][k] = v;
      }
    }
  }
  return hints;
}

/* ------------------------- enum write queue ------------------------- */
const enumEmits = new Map(); // key: fileAbs, value: node

function queueEnumEmit(def) {
  const prev = enumEmits.get(def.fileAbs);
  if (!prev) { enumEmits.set(def.fileAbs, def.node); return; }

  // merge conservatively: union enum values, last-wins for labels/descriptions
  const out = JSON.parse(JSON.stringify(prev));
  const cur = def.node;
  if (Array.isArray(cur.enum)) {
    const set = new Set([...(out.enum || []), ...cur.enum]);
    out.enum = Array.from(set);
  }
  if (cur["x-enumNames"]) out["x-enumNames"] = cur["x-enumNames"];
  if (cur["x-enumDescriptions"]) out["x-enumDescriptions"] = cur["x-enumDescriptions"];
  enumEmits.set(def.fileAbs, out);
}

async function flushEnumEmits() {
  for (const [fileAbs, node] of enumEmits.entries()) {
    await writeJSON(fileAbs, node);
    console.log("✓ Wrote enum", path.relative(repoRoot, fileAbs));
  }
}

/* ------------------------- schema building ------------------------- */
function schemaFrom(hints, className, ctx) {
  const title = hints.title || className;
  const schema = { title, type: "object", properties: {} };
  if (hints.required?.length) schema.required = Array.from(new Set(hints.required));

  for (const [prop, spec] of Object.entries(hints.fields || {})) {
    const out = {};

    if (spec.desc) out.description = String(spec.desc);
    if (spec.default !== undefined) out.default = spec.default;
    if (spec.format) out.format = String(spec.format);
    if (spec.enum) out.enum = spec.enum;

    // const support
    if (spec.const !== undefined) {
      const raw = spec.const;
      out.const = (typeof raw === "string" && /^".*"$/.test(raw)) ? raw.slice(1, -1) : raw;
    }

    // enumFrom → $ref to existing enum JSON
    if (spec.enumFrom) {
      const ep = parseEnumPathLike(String(spec.enumFrom), ctx);
      if (ep) out.$ref = ep.$id;
    }

    // enumDefine → $ref, and optionally write enum JSON if allowed
    if (spec.enumDefine && typeof spec.enumDefine === "object") {
      const ed = spec.enumDefine;
      const pLike = ed.path || ed.id || ed.ref;
      const ep = parseEnumPathLike(String(pLike), ctx);
      if (ep) {
        // schemas always reference the enum
        out.$ref = ep.$id;

        // only write if BOTH: global flag ON and field opts in
        if (emitEnums && ed.generate === true) {
          const node = {
            $id: ep.$id,
            title: ed.title || ep.name,
            type: (ed.type === "integer" ? "integer" : "string"),
            enum: Array.isArray(ed.enum) ? ed.enum.slice() : []
          };
          if (Array.isArray(ed["x-enumNames"])) node["x-enumNames"] = ed["x-enumNames"].slice();
          if (Array.isArray(ed["x-enumDescriptions"])) node["x-enumDescriptions"] = ed["x-enumDescriptions"].slice();
          queueEnumEmit({ fileAbs: ep.fileAbs, node });
        }
      }
    }

    // type or $ref for class references
    if (!out.$ref) {
      if (spec.$ref) {
        out.$ref = toAbsoluteRef(String(spec.$ref), ctx);
      } else if (spec.type) {
        const t = String(spec.type);
        if (["string","number","integer","boolean","object","array","null"].includes(t)) {
          out.type = t;
          if (t === "array" && spec.items) {
            const it = {};
            if (spec.items.$ref) it.$ref = toAbsoluteRef(String(spec.items.$ref), ctx);
            if (spec.items.type) it.type = String(spec.items.type);
            if (spec.items.const !== undefined) {
              const r = spec.items.const;
              it.const = (typeof r === "string" && /^".*"$/.test(r)) ? r.slice(1,-1) : r;
            }
            if (spec.items.enumFrom) {
              const eip = parseEnumPathLike(String(spec.items.enumFrom), ctx);
              if (eip) it.$ref = eip.$id;
            }
            if (spec.items.enum) it.enum = spec.items.enum;
            out.items = it;
          }
        } else {
          out.$ref = toAbsoluteRef(t, ctx);
        }
      } else if (spec.const !== undefined) {
        // infer type if only const provided
        const v = (typeof spec.const === "string" && /^".*"$/.test(spec.const)) ? spec.const.slice(1,-1) : spec.const;
        const inferred = (v === null) ? "null" : typeof v;
        if (["string","number","boolean","null"].includes(inferred)) {
          out.type = inferred === "number" ? "number" :
                     inferred === "boolean" ? "boolean" :
                     inferred === "string" ? "string" : "null";
        }
      }
    }

    // numeric/string limits
    if (Array.isArray(spec.range) && spec.range.length === 2) {
      const [min, max] = spec.range.map(Number);
      if (!Number.isNaN(min)) out.minimum = min;
      if (!Number.isNaN(max)) out.maximum = max;
    }
    if (spec.minLength !== undefined) out.minLength = Number(spec.minLength);
    if (spec.maxLength !== undefined) out.maxLength = Number(spec.maxLength);

    schema.properties[prop] = out;
  }

  for (const key of ["oneOf","anyOf","allOf"]) if (hints[key]) schema[key] = hints[key];
  if (hints.xor) schema["x-hint-xor"] = hints.xor;

  return schema;
}

/* ------------------------- main ------------------------- */
async function main() {
  if (!fs.existsSync(packagesDir)) {
    console.error("No packages/ directory found at", packagesDir);
    process.exit(1);
  }
  const allPuml = walkPumlSync(packagesDir).filter((p) => /[\\/]puml[\\/]/.test(p));
  if (allPuml.length === 0) { console.log("No .puml files under packages/**/puml"); return; }

  for (const f of allPuml) {
    const src = await readText(f);
    const blocks = extractBlocks(src);
    if (!blocks.length) continue;

    // packages/<seg>/puml[/subs]/Class.puml
    const relParts = f.split(/[\\/]/);
    const iPkg = relParts.indexOf("packages");
    const seg = relParts[iPkg + 1];
    const subs = relParts.slice(iPkg + 3, -1).filter(Boolean);
    const ctx = { seg, subs };

    for (const { name, body } of blocks) {
      const hints = parseHints(body);
      const schema = schemaFrom(hints, name, ctx);
      const title = hints.title || name;
      const nsPath = [seg, ...subs, title].join("/");
      schema.$id = baseId + nsPath + ".schema.json";

      const outFile = path.join(repoRoot, "packages", seg, "json", "schemas", ...subs, `${title}.schema.json`);
      await writeJSON(outFile, schema);
      console.log("✓ Wrote", path.relative(repoRoot, outFile));
    }
  }

  // write any external enums queued from enumDefine hints (only when enabled)
  if (emitEnums) {
    await flushEnumEmits();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
