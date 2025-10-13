#!/usr/bin/env node
// tools/generate-json-from-puml.mjs
// Minimal SCHEMAHINTS v0.1 → JSON Schema emitter (Draft 2020-12)

import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');       // tools/.. -> repo root
const packagesDir = resolve(repoRoot, 'packages');

const args = process.argv.slice(2);
let baseId = 'https://example.org/hatpro/schema/';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseId' && args[i+1]) baseId = args[i+1].replace(/\/?$/, '/');
}

function walk(dir, acc=[]) {
  const ent = require('node:fs').readdirSync(dir, { withFileTypes: true });
  for (const e of ent) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const readText = (p) => fs.readFile(p, 'utf8');

// Grab `class Name { … }` and the nearest `note … end note`
function extractBlocks(src) {
  const classes = [];
  const classRe = /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{[^}]*\}([\s\S]*?)(?=class\s+|@enduml|$)/g;
  let m;
  while ((m = classRe.exec(src))) {
    const name = m[1];
    const tail = m[2] || '';
    const noteMatch =
      /note\s+(?:right|left|top|bottom)\s+of\s+[A-Za-z_][A-Za-z0-9_]*\s*([\s\S]*?)end\s*note/i.exec(tail) ||
      /note\s+([\s\S]*?)end\s*note/i.exec(tail);
    const note = noteMatch ? noteMatch[1] : '';
    classes.push({ name, note });
  }
  return classes;
}

// Parse SCHEMAHINTS v0.1 `note` block
function parseHints(noteText) {
  const out = { title:null, additionalProperties:undefined, required:[], xor:null, fields:{} };
  const lines = noteText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    if (/^SCHEMAHINTS/i.test(line)) continue;
    if (/^title\s*:/i.test(line)) out.title = line.split(':',2)[1].trim();
    else if (/^additionalProperties\s*:/i.test(line)) out.additionalProperties = /true/i.test(line.split(':',2)[1]);
    else if (/^required\s*:/i.test(line)) {
      const arr = (line.split(':',2)[1] || '').match(/\[(.*?)\]/);
      if (arr) out.required = arr[1].split(',').map(s=>s.trim()).filter(Boolean);
    } else if (/^xor\s*:/i.test(line)) {
      const m = (line.split(':',2)[1] || '').match(/\((.*?)\)/);
      if (m) out.xor = m[1].split('|').map(s=>s.trim());
    }
  }

  // field blocks
  const fieldBlockRe = /field\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*?)(?=field\s+[A-Za-z_]|$)/gi;
  let fm;
  while ((fm = fieldBlockRe.exec(noteText))) {
    const name = fm[1];
    const body = fm[2];
    const f = {};
    for (const raw of body.split(/\r?\n/)) {
      const L = raw.trim(); if (!L) continue;
      const [k, ...rest] = L.split(':'); const v = rest.join(':').trim();
      const key = (k||'').toLowerCase();
      if (['type','format','pattern','desc'].includes(key)) f[key] = v;
      else if (key === 'default') try { f.default = JSON.parse(v); } catch { f.default = v.replace(/^["']|["']$/g,''); }
      else if (key === 'ref' || key === 'refid') f.$ref = v.replace(/^["']|["']$/g,'');
      else if (key === 'itemsref' || key === 'itemsrefid') f.itemsRef = v.replace(/^["']|["']$/g,'');
      else if (key === 'itemstype') f.itemsType = v;
      else if (key === 'enumref') f.enumRef = v.replace(/^["']|["']$/g,'');
      else if (key === 'itemsenumref') f.itemsEnumRef = v.replace(/^["']|["']$/g,'');
    }
    out.fields[name] = f;
  }
  return out;
}

function typeMapping(t) {
  if (!t) return undefined;
  const low = t.toLowerCase();
  if (low === 'datetime') return { type:'string', format:'date-time' };
  if (low === 'date')     return { type:'string', format:'date' };
  if (['string','number','integer','boolean','array','object'].includes(low)) return { type:low };
  return { type:'string' };
}

function toEnumRef(p) {
  if (!p) return p;
  if (p.startsWith('#')) return p;
  if (/^https?:\/\//i.test(p)) return p;
  // leave relative enum refs as-is; your loader/validator resolves them
  return p;
}

function schemaFrom(hints, className) {
  const title = hints.title || className;
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: baseId + encodeURIComponent(title) + '.schema.json',
    title,
    type: 'object',
    additionalProperties: hints.additionalProperties === undefined ? true : !!hints.additionalProperties,
    properties: {},
    required: hints.required || [],
  };

  for (const [name, f] of Object.entries(hints.fields || {})) {
    let prop;
    if (f.$ref) {
      prop = { $ref: f.$ref.startsWith('#') ? f.$ref : toEnumRef(f.$ref) };
    } else if (f.enumRef) {
      prop = { $ref: toEnumRef(f.enumRef) };
    } else if (f.itemsRef || f.itemsEnumRef || f.itemsType) {
      prop = { type:'array', items:{} };
      if (f.itemsRef)        prop.items = { $ref: f.itemsRef.startsWith('#') ? f.itemsRef : toEnumRef(f.itemsRef) };
      else if (f.itemsEnumRef) prop.items = { $ref: toEnumRef(f.itemsEnumRef) };
      else if (f.itemsType)  prop.items = typeMapping(f.itemsType);
    } else {
      prop = typeMapping(f.type) || {};
    }
    if (f.format)  prop.format = f.format;
    if (f.pattern) prop.pattern = f.pattern;
    if (f.default !== undefined) prop.default = f.default;
    if (f.desc)    prop.description = f.desc;
    schema.properties[name] = prop;
  }

  if (hints.xor && hints.xor.length >= 2) {
    schema.oneOf = hints.xor.map(k => ({ required:[k] }));
  }

  return schema;
}

async function main() {
  const exists = require('node:fs').existsSync;
  if (!exists(packagesDir)) {
    console.error('No packages/ directory found. Run from repo root.');
    process.exit(1);
  }
  const segments = require('node:fs').readdirSync(packagesDir).filter(d => exists(join(packagesDir,d,'puml')));
  for (const seg of segments) {
    const pumlDir = join(packagesDir, seg, 'puml');
    const outDir  = join(packagesDir, seg, 'json', 'schemas');
    require('node:fs').mkdirSync(outDir, { recursive: true });

    const pumlFiles = walk(pumlDir).filter(f => f.toLowerCase().endsWith('.puml'));
    for (const f of pumlFiles) {
      const src     = await readText(f);
      const classes = extractBlocks(src);
      if (!classes.length) continue;
      const { name, note } = classes[0]; // primary class per file
      const hints = parseHints(note || '');
      const schema = schemaFrom(hints, name);
      const outPath = join(outDir, (hints.title || name) + '.schema.json');
      await fs.writeFile(outPath, JSON.stringify(schema, null, 2), 'utf8');
      console.log('Emitted:', outPath);
    }
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });

