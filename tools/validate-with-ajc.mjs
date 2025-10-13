#!/usr/bin/env node
// tools/validate-with-ajc.mjs
import { promises as fs } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const repoRoot = resolve(new URL('.', import.meta.url).pathname, '..');
const packagesDir = resolve(repoRoot, 'packages');

function walk(dir, acc=[]) {
  const { readdirSync, statSync } = require('node:fs');
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

async function loadSchemas(ajv) {
  const schemaFiles = walk(packagesDir).filter(f => /json[\\\/]schemas[\\\/].+\.schema\.json$/i.test(f));
  for (const f of schemaFiles) {
    const sch = JSON.parse(await fs.readFile(f, 'utf8'));
    ajv.addSchema(sch);
  }
  return schemaFiles.length;
}

function findSchemaForSample(ajv, samplePath) {
  const base = basename(samplePath).toLowerCase().replace(/\.json$/,'');
  for (const id of Object.keys(ajv.schemas)) {
    const sch = ajv.schemas[id].schema || ajv.schemas[id];
    const title = (sch?.title || '').toLowerCase();
    if (title && base.startsWith(title)) return ajv.getSchema(sch.$id) || ajv.compile(sch);
  }
  for (const id of Object.keys(ajv.schemas)) {
    const sch = ajv.schemas[id].schema || ajv.schemas[id];
    if (sch && /travelprofile/i.test(sch.title || '')) return ajv.getSchema(sch.$id) || ajv.compile(sch);
  }
  return null;
}

async function main() {
  const ajv = new Ajv({ strict:false, allErrors:true }); addFormats(ajv);
  const count = await loadSchemas(ajv);
  if (!count) console.warn('No schemas loaded. Did you run the generator?');

  const sampleFiles = walk(packagesDir).filter(f => /[\\\/]samples[\\\/].+\.json$/i.test(f));
  let failures = 0;
  for (const f of sampleFiles) {
    const data = JSON.parse(await fs.readFile(f, 'utf8'));
    const validate = findSchemaForSample(ajv, f);
    if (!validate) { console.warn(`No matching schema for sample: ${f}`); continue; }
    const ok = validate(data);
    if (!ok) { failures++; console.error(`❌ ${f}`); console.error(validate.errors); }
    else { console.log(`✅ ${f}`); }
  }
  if (failures) process.exit(1); else console.log('All samples passed (or were skipped).');
}
main().catch(err => { console.error(err); process.exit(1); });

