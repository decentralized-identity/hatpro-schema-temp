#!/usr/bin/env node
// generate-json-schema-from-puml.mjs  (v1.2)
// Class-schemas-only generator: emits JSON Schemas for classes in PUML with SCHEMAHINTS.
// It DOES NOT write enum JSON files. If a field has enumDefine, the field becomes a $ref to the enum's $id.
//
// Usage:
//   node tools/generate-json-schema-from-puml.mjs --baseId https://schemas.example.org/hatpro/ [--packagesDir packages] [--file path/to/foo.puml] [--debug]
//
// Resolution & output:
//   - For a PUML file at packages/<seg>/puml/<subs>/<File>.puml, this writes to:
//       packages/<seg>/json/schemas/<subs>/<ClassName>.schema.json
//   - $id is built as: <baseId><seg>/<subs>/<ClassName>.schema.json
//
// Supported SCHEMAHINTS (root):
//   title, description, required:[..], additionalProperties: true|false
//
// Supported field hints:
//   type, $ref, desc, default, const, format, range:[min,max], minLength, maxLength, pattern
//   items:{ type|$ref }, properties:{ ... } for nested object/array
//   enumDefine: { enumId|path: /seg/subs/Name, ... } -> sets $ref to <baseId>seg/subs/Name.json
//

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

function parseNotes(text) {
  const blocks = [];
  const re = /note\s+(?:right|left|over)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)[\s\S]*?end note/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const host = m[1];
    const block = m[0];
    if (!/^\s*SCHEMAHINTS\b/m.test(block)) continue;
    blocks.push({ host, block });
  }
  return blocks;
}

function parseSchemaHints(block) {
  const lines = block.replace(/\t/g, "  ").split(/\r?\n/);
  const hints = { fields: {}, root: {} };
  let inHints = false;
  let currentField = null;

  for (let idx = 0; idx < lines.length; idx++) {
    let raw = lines[idx];
    if (/^\s*'/.test(raw)) continue;
    const line = raw;
    if (!inHints) { if (/^\s*SCHEMAHINTS\b/.test(line)) inHints = true; continue; }
    if (/^\s*end note\b/i.test(line)) break;

    const fieldStart = line.match(/^\s*field\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/);
    if (fieldStart) { currentField = fieldStart[1]; hints.fields[currentField] = {}; continue; }

    const kv = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)\s*$/);
    if (kv) {
      let [, key, val] = kv;
      val = val.trim();
      // nested enumDefine
      if (currentField && key === "enumDefine" && val === "") {
        const obj = {};
        idx = readNestedObject(lines, idx + 1, obj);
        hints.fields[currentField].enumDefine = obj;
        continue;
      }
      // arrays inline
      if (/^\[.*\]$/.test(val)) {
        const arr = val.slice(1,-1).split(",").map(s => s.trim()).filter(Boolean);
        if (currentField) hints.fields[currentField][key] = arr;
        else hints.root[key] = arr;
        continue;
      }
      // scalars
      const scalar = coerceScalar(val);
      if (currentField) hints.fields[currentField][key] = scalar;
      else hints.root[key] = scalar;
    }
  }
  return hints;
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
    if (/^\[.*\]$/.test(v2)) {
      outObj[k2] = v2.slice(1,-1).split(",").map(s => s.trim()).filter(Boolean);
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

function coerceScalar(v) {
  if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function buildSchema(hostClass, hints, fileRel, baseId) {
  // derive seg/subs from fileRel: packages/<seg>/puml/<subs>/<file>.puml
  const parts = fileRel.replace(/\\/g, '/').split('/').filter(Boolean);
  const iSeg = parts.indexOf('packages') + 1;
  const seg = parts[iSeg] || 'core';
  const subs = [];
  for (let i = iSeg + 2; i < parts.length - 1; i++) subs.push(parts[i]); // after 'puml'

  const idPath = [seg, ...subs, `${hostClass}.schema.json`].join('/');
  const $id = baseId + idPath;

  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id,
    title: hints.root.title || hostClass,
    type: "object",
    additionalProperties: (typeof hints.root.additionalProperties === 'boolean') ? hints.root.additionalProperties : false,
    properties: {},
  };

  const req = Array.isArray(hints.root.required) ? hints.root.required : [];
  if (req.length) schema.required = req;
  if (hints.root.description) schema.description = hints.root.description;

  for (const [fname, spec] of Object.entries(hints.fields || {})) {
    const f = {};
    if (spec.desc) f.description = spec.desc;
    if (spec.default !== undefined) f.default = spec.default;
    if (spec.const !== undefined) f.const = spec.const;
    if (spec.format) f.format = spec.format;
    if (Array.isArray(spec.range) && spec.range.length === 2) {
      const [min, max] = spec.range;
      if (min !== null && min !== undefined && !Number.isNaN(Number(min))) f.minimum = Number(min);
      if (max !== null && max !== undefined && !Number.isNaN(Number(max))) f.maximum = Number(max);
    }
    if (spec.minLength !== undefined) f.minLength = Number(spec.minLength);
    if (spec.maxLength !== undefined) f.maxLength = Number(spec.maxLength);
    if (spec.pattern) f.pattern = String(spec.pattern);

    if (spec["$ref"]) {
      const refPath = String(spec["$ref"]).replace(/^\//, '');
      f["$ref"] = baseId + refPath + ".schema.json";
    } else if (spec.enumDefine && (spec.enumDefine.enumId || spec.enumDefine.path)) {
      const enumId = String(spec.enumDefine.enumId || spec.enumDefine.path).replace(/^\//, '');
      f["$ref"] = baseId + enumId + ".json";
    } else if (spec.type) {
      if (spec.type === "object") {
        f.type = "object";
        if (spec.properties && typeof spec.properties === 'object') {
          f.properties = spec.properties;
        }
      } else if (spec.type === "array") {
        f.type = "array";
        if (spec.items && typeof spec.items === 'object') {
          const it = {};
          if (spec.items.type) it.type = spec.items.type;
          if (spec.items["$ref"]) {
            it["$ref"] = baseId + String(spec.items["$ref"]).replace(/^\//, '') + ".schema.json";
          }
          f.items = it;
        }
      } else {
        f.type = spec.type;
      }
    }
    schema.properties[fname] = f;
  }
  return { schema, seg, subs };
}

function outPathFor(hostClass, seg, subs) {
  return path.join('packages', seg, 'json', 'schemas', ...subs, `${hostClass}.schema.json`);
}

function processFile(absPath, rootDir, baseId) {
  const text = fs.readFileSync(absPath, 'utf-8');
  const rel = path.relative(rootDir, absPath);
  const notes = parseNotes(text);
  if (debug) console.log(`Found ${notes.length} SCHEMAHINTS block(s) in ${rel}`);
  for (const n of notes) {
    const hints = parseSchemaHints(n.block);
    const { schema, seg, subs } = buildSchema(n.host, hints, rel, baseId);
    const outFile = outPathFor(n.host, seg, subs);
    ensureDir(outFile);
    fs.writeFileSync(outFile, JSON.stringify(schema, null, 2), 'utf-8');
    console.log(`✓ Wrote ${outFile}`);
  }
}

function main() {
  const root = path.resolve(process.cwd(), packagesDir);
  const files = singleFile ? [path.resolve(process.cwd(), singleFile)] : listPumlFiles(root);
  if (!files.length) {
    console.warn(`No .puml files found under ${root}`);
    return;
  }
  files.forEach(f => processFile(f, root, baseId));
}

main();
