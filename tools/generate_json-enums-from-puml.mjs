#!/usr/bin/env node
// generate_json-enums-from-puml.mjs  (v1.2)
// Enum-only generator: emits enum JSON from PUML SCHEMAHINTS.
//
// Supports v1.2 keys inside a field block:
//   enumDefine:
//     enumId: /core/commonLib/TextEncodingEnum
//     targetPath: /core/json/enums/commonLib/TextEncodingEnum
//     sourcePath: /core/puml/commonLib/TextEncodingEnum.puml
//     title: TextEncodingEnum
//     type: string | integer
//     generate: true
//     enum: [A, B, C] | A, B, C | (block list)
//     x-enumNames: [..]
//     x-enumDescriptions:
//       - ...
//
// Usage:
//   node tools/generate_json-enums-from-puml.mjs --baseId https://schemas.example.org/hatpro/ [--packagesDir packages] [--file path/to/foo.puml] [--debug]
//
// Authoring guardrails:
//   • Keep everything under `enumDefine:` indented (no blank lines in the block).
//   • Use PlantUML comments `' ...` inside the note (avoid `#`).
//   • Any of these formats for enum values are accepted:
//       enum: [A, B, C]
//       enum: A, B, C
//       enum:
//         - A
//         - B
//         - C
//   • _genEnum suffix: If you create purely dummy host classes named Something_genEnum,
//     that convention is for your own clarity; this script only emits enum JSON and never writes class schemas.

import fs from 'fs';
import path from 'path';
import process from 'process';

const argv = process.argv.slice(2);
function getArgVal(name, def = undefined) {
  const i = argv.findIndex(a => a === name || a.startsWith(name + "="));
  if (i === -1) return def;
  const eq = argv[i].indexOf("=");
  if (eq > -1) return argv[i].slice(eq+1);
  if (i + 1 < argv.length && !argv[i+1].startsWith("--")) return argv[i+1];
  return true;
}
const debug = !!getArgVal("--debug", false);
function log(...args){ if (debug) console.log(...args); }

let baseId = String(getArgVal("--baseId", "")).trim();
if (!baseId) {
  console.error("ERROR: --baseId is required (e.g., --baseId https://schemas.example.org/hatpro/)");
  process.exit(1);
}
if (!/\/$/.test(baseId)) baseId += "/";
const packagesDir = String(getArgVal("--packagesDir", "packages")).trim();
const singleFile = getArgVal("--file", null);

function listPumlFiles(root) {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".puml")) out.push(p);
    }
  }
  walk(root);
  return out;
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function parseHintsFromText(text) {
  const notes = [];
  const noteRe = /note\s+(?:right|left|over)\s+of[\s\S]*?end note/gi;
  let m;
  while ((m = noteRe.exec(text)) !== null) {
    const block = m[0];
    if (!/^\s*SCHEMAHINTS\b/m.test(block)) continue;
    notes.push(parseSchemaHints(block));
  }
  return notes.flat();
}

function parseSchemaHints(block) {
  const lines = block.replace(/\t/g, "  ").split(/\r?\n/);
  const results = [];
  let inHints = false;
  let current = { fields: {} };
  let currentField = null;

  function commitIfAny() {
    if (Object.keys(current.fields).length) results.push(JSON.parse(JSON.stringify(current)));
  }

  for (let idx = 0; idx < lines.length; idx++) {
    let raw = lines[idx];
    if (/^\s*'/.test(raw)) continue; // skip PlantUML comments
    const line = raw;
    if (!inHints) { if (/^\s*SCHEMAHINTS\b/.test(line)) inHints = true; continue; }
    if (/^\s*end note\b/i.test(line)) break;

    const f = line.match(/^\s*field\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/);
    if (f) { currentField = f[1]; current.fields[currentField] = {}; continue; }

    const kv = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)\s*$/);
    if (kv && currentField) {
      let [, key, val] = kv;
      val = val.trim();

      if (key === "enumDefine" && val === "") {
        const obj = {};
        idx = readNestedObject(lines, idx + 1, obj);
        current.fields[currentField].enumDefine = obj;
        continue;
      }
      if ((key === "enum" || key === "x-enumNames" || key === "x-enumDescriptions") && val === "") {
        const arr = [];
        idx = readBlockList(lines, idx + 1, arr);
        current.fields[currentField][key] = arr;
        continue;
      }
      if (/^\[.*\]$/.test(val)) {
        current.fields[currentField][key] = splitInlineList(val.slice(1,-1));
        continue;
      }
      if (key === "enum" && /,/.test(val)) {
        current.fields[currentField][key] = splitInlineList(val);
        continue;
      }
      current.fields[currentField][key] = coerceScalar(val);
      continue;
    }
  }
  commitIfAny();
  return results;
}

function splitInlineList(s) {
  return s.split(",").map(x => x.trim()).filter(Boolean).map(stripQuotes);
}
function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1,-1);
  }
  return s;
}

function readNestedObject(lines, startIdx, outObj) {
  let idx = startIdx - 1;
  for (let j = startIdx; j < lines.length; j++) {
    const raw = lines[j];
    if (/^\s*'/.test(raw)) { idx = j; continue; }
    if (/^\s*end note\b/i.test(raw)) { idx = j - 1; break; }
    if (/^\s*field\s+[A-Za-z_]/.test(raw)) { idx = j - 1; break; }
    if (!/^\s{2,}\S/.test(raw)) { idx = j - 1; break; }
    const ln = raw.replace(/\t/g, "  ");
    const kv2 = ln.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)\s*$/);
    if (!kv2) { idx = j; continue; }
    let [, k2, v2] = kv2;
    v2 = v2.trim();
    if ((k2 === "enum" || k2 === "x-enumNames" || k2 === "x-enumDescriptions") && v2 === "") {
      const arr = [];
      const stop = readBlockList(lines, j + 1, arr);
      outObj[k2] = arr;
      j = stop; idx = j; continue;
    }
    if (/^\[.*\]$/.test(v2)) {
      outObj[k2] = splitInlineList(v2.slice(1,-1));
    } else if (k2 === "enum" && /,/.test(v2)) {
      outObj[k2] = splitInlineList(v2);
    } else if (/^(true|false)$/i.test(v2)) {
      outObj[k2] = /^true$/i.test(v2);
    } else if (/^-?\d+(?:\.\d+)?$/.test(v2)) {
      outObj[k2] = Number(v2);
    } else {
      outObj[k2] = v2;
    }
    idx = j;
  }
  return idx;
}

function readBlockList(lines, startIdx, outArr) {
  let j = startIdx;
  for (; j < lines.length; j++) {
    const raw = lines[j];
    if (/^\s*'/.test(raw)) continue;
    if (/^\s*end note\b/i.test(raw)) return j - 1;
    if (!/^\s{2,}\S/.test(raw)) return j - 1;
    const m = raw.match(/^\s*(?:[-*]\s+)?(.+)$/);
    if (!m) return j - 1;
    let item = m[1].trim();
    if (item.endsWith(",")) item = item.slice(0, -1).trim();
    if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
      item = item.slice(1, -1);
    }
    outArr.push(item);
  }
  return j - 1;
}

function coerceScalar(v) {
  if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function deriveEnumFileFromEnumId(enumId) {
  const parts = enumId.replace(/^\//, "").split("/").filter(Boolean);
  const seg = parts[0];
  const name = parts[parts.length - 1];
  const subs = parts.slice(1, -1);
  const rel = path.join(seg, "json", "enums", ...subs, name + ".json");
  return path.join(packagesDir, rel);
}

function emitEnumFromDefine(ed, originFile) {
  const enumId = (ed.enumId || ed.path || "").trim();
  if (!enumId || !enumId.startsWith("/")) {
    console.warn(`! Skipping enum with invalid enumId/path in ${originFile}: "${enumId}"`);
    return;
  }
  const targetPath = ed.targetPath ? String(ed.targetPath).trim() : "";
  const $id = baseId + enumId.replace(/^\//, "") + ".json";
  const outFile = targetPath
    ? path.join(packagesDir, targetPath.replace(/^\//, "")) + ".json"
    : deriveEnumFileFromEnumId(enumId);

  let values = [];
  if (Array.isArray(ed.enum)) values = ed.enum.slice();
  else if (typeof ed.enum === "string" && ed.enum.length) values = ed.enum.split(",").map(x => x.trim()).filter(Boolean);

  const node = {
    $id,
    title: ed.title || enumId.split("/").pop(),
    type: (ed.type === "integer" ? "integer" : "string"),
    enum: values
  };
  if (Array.isArray(ed["x-enumNames"])) node["x-enumNames"] = ed["x-enumNames"].slice();
  if (Array.isArray(ed["x-enumDescriptions"])) node["x-enumDescriptions"] = ed["x-enumDescriptions"].slice();
  if (ed.sourcePath) node["x-sourcePath"] = String(ed.sourcePath);

  if (debug) {
    console.log("— enumDefine parsed —", { originFile, enumId, targetPath, $id, count: node.enum.length });
  }

  const shouldGenerate = (typeof ed.generate === "boolean") ? ed.generate : true;
  if (!shouldGenerate) {
    console.log(`↷ Skipped (generate:false) ${outFile}`);
    return;
  }
  ensureDir(outFile);
  fs.writeFileSync(outFile, JSON.stringify(node, null, 2), "utf-8");
  console.log(`✓ Wrote enum ${outFile}`);
}

function processFile(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const notes = parseHintsFromText(text);
  if (debug) console.log(`Parsed ${notes.length} SCHEMAHINTS note(s) in ${filePath}`);
  notes.forEach(note => {
    for (const [fname, spec] of Object.entries(note.fields || {})) {
      if (spec && typeof spec === "object" && spec.enumDefine && typeof spec.enumDefine === "object") {
        emitEnumFromDefine(spec.enumDefine, filePath);
      }
    }
  });
}

function main() {
  const files = singleFile ? [path.resolve(process.cwd(), singleFile)] : listPumlFiles(path.resolve(process.cwd(), packagesDir));
  if (!files.length) {
    console.warn(`No .puml files found. Root=${path.resolve(process.cwd(), packagesDir)} file=${singleFile||''}`);
    return;
  }
  if (debug) console.log("Scanning files:", files);
  files.forEach(processFile);
}

main();
