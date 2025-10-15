#!/usr/bin/env node
// tools/validate-with-ajc.mjs
// ESM, Ajv2020, Windows-safe paths, enum preloading, strict sample expectations.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { join, resolve, basename, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesDir = resolve(repoRoot, 'packages');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

function dirnameOfUrl(u) {
  const i = u.lastIndexOf('/');
  return i >= 0 ? u.slice(0, i + 1) : u;
}

// ---------- Loaders ----------
async function loadSchemas(ajv) {
  const schemaFiles = walk(packagesDir).filter(f =>
    /json[\\\/]schemas[\\\/].+\.schema\.json$/i.test(f)
  );

  const loaded = [];
  for (const f of schemaFiles) {
    const sch = JSON.parse(await fsp.readFile(f, 'utf8'));

    // Register by $id (normal)
    if (sch.$id) ajv.addSchema(sch);

    // Also register by title ("IdentityInfo")
    if (sch.title) ajv.addSchema(sch, sch.title);

    // Also register by filename ("IdentityInfo.schema.json")
    const fname = basename(f);
    ajv.addSchema(sch, fname);

    // Also register by $id without .schema.json (so .../IdentityInfo works)
    if (sch.$id && /\.schema\.json$/i.test(sch.$id)) {
      const noExt = sch.$id.replace(/\.schema\.json$/i, '');
      ajv.addSchema(sch, noExt);
    }

    loaded.push(sch);
  }
  return loaded;
}

async function loadEnums(ajv, absoluteBaseId) {
  const enumFiles = walk(packagesDir).filter(f =>
    /json[\\\/]enums[\\\/].+\.json$/i.test(f)
  );
  let count = 0;
  for (const f of enumFiles) {
    const sch = JSON.parse(await fsp.readFile(f, 'utf8'));

    // Relative key like "diet/DietKind.json"
    const enumsRoot = join(f.split('json')[0], 'json', 'enums');
    const rel = relative(enumsRoot, f).split(sep).join('/'); // POSIX normalize

    // Register under relative key
    ajv.addSchema(sch, rel);

    // And also under absolute URL using inferred base (or $id if it's absolute)
    if (absoluteBaseId) {
      const absKey = (sch.$id && /^https?:\/\//i.test(sch.$id))
        ? sch.$id
        : absoluteBaseId + rel.replace(/^\/*/, '');
      ajv.addSchema(sch, absKey);
    }

    count++;
  }
  return count;
}

// ---------- Matching ----------
function pickSchemaForSample(ajv, samplePath) {
  const fileName = basename(samplePath);                 // e.g., TravelerName.invalid.json
  const name = fileName.replace(/\.json$/i, '');         // TravelerName.invalid
  const core = name.replace(/\.(valid|invalid)$/i, '');  // TravelerName

  // 1) Exact title match
  for (const id of Object.keys(ajv.schemas)) {
    const wrap = ajv.schemas[id]; const sch = wrap?.schema || wrap;
    if (!sch || !sch.title) continue;
    if (sch.title.toLowerCase() === core.toLowerCase()) {
      return { validate: ajv.getSchema(sch.$id) || ajv.compile(sch), title: sch.title, id: sch.$id || id, reason: 'title' };
    }
  }

  // 2) Filename key ("TravelerName.schema.json")
  const fname = `${core}.schema.json`.toLowerCase();
  if (ajv.schemas[fname]) {
    const wrap = ajv.schemas[fname]; const sch = wrap?.schema || wrap;
    return { validate: ajv.getSchema(sch.$id) || ajv.compile(sch), title: sch.title, id: sch.$id || fname, reason: 'filename' };
  }

  // 3) $id ends with "/<core>.schema.json"
  for (const id of Object.keys(ajv.schemas)) {
    const wrap = ajv.schemas[id]; const sch = wrap?.schema || wrap;
    const sid = (sch && sch.$id || '').toLowerCase();
    if (sid && sid.endsWith(`/${core.toLowerCase()}.schema.json`)) {
      return { validate: ajv.getSchema(sch.$id) || ajv.compile(sch), title: sch.title, id: sch.$id, reason: '$id suffix' };
    }
  }

  return null; // no confident match
}

// ---------- Main ----------
async function main() {
  if (!fs.existsSync(packagesDir)) {
    console.error(`No packages/ directory at: ${packagesDir}`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  // 1) Load schemas and infer absolute base from any $id
  const schemas = await loadSchemas(ajv);

  let absoluteBaseId = null;
  for (const sch of schemas) {
    if (sch.$id && /^https?:\/\//i.test(sch.$id)) {
      absoluteBaseId = dirnameOfUrl(sch.$id); // e.g., https://example.org/hatpro/schema/
      break;
    }
  }

  // 2) Load enums with both relative and absolute registrations
  const enumsLoaded = await loadEnums(ajv, absoluteBaseId);

  if (!schemas.length) {
    console.warn('No schemas loaded from packages/**/json/schemas. Did you run the generator?');
  } else {
    console.log(`Loaded ${schemas.length} schema(s), ${enumsLoaded} enum(s). BaseId=${absoluteBaseId ?? '(none)'}`);
  }

  // 3) Validate samples, with strict expectations:
  //    *.valid.json must PASS, *.invalid.json must FAIL
  const sampleFiles = walk(packagesDir).filter(f =>
    /[\\\/]samples[\\\/].+\.json$/i.test(f)
  );

  if (!sampleFiles.length) {
    console.log('No samples found under packages/**/samples. Nothing to validate.');
    return;
  }

  let failures = 0;
  for (const f of sampleFiles) {
    const fileName = basename(f);
    const expectValid = !/\.invalid\.json$/i.test(fileName);

    try {
      const data = JSON.parse(await fsp.readFile(f, 'utf8'));
      const picked = pickSchemaForSample(ajv, f);

      if (!picked) {
        failures++;
        console.error(`🚫 No matching schema for sample (strict): ${f}`);
        continue;
      }

      const ok = picked.validate(data);
      const used = `${picked.title || '(untitled)'} [${picked.id || 'no-id'} via ${picked.reason}]`;

      if (expectValid && ok) {
        console.log(`✅ ${fileName} — matched ${used}`);
      } else if (!expectValid && !ok) {
        console.log(`✅ ${fileName} (expected to fail) — matched ${used}`);
      } else {
        failures++;
        if (expectValid && !ok) {
          console.error(`❌ ${fileName} — expected VALID but failed — matched ${used}`);
          console.error(picked.validate.errors);
        } else if (!expectValid && ok) {
          console.error(`❌ ${fileName} — expected INVALID but passed — matched ${used}`);
        }
      }
    } catch (e) {
      failures++;
      console.error(`💥 Exception while validating ${fileName}`);
      console.error(String(e && e.stack || e));
    }
  }

  if (failures) process.exit(1);
  console.log('All samples met expectations.');
}

main().catch(err => { console.error(err); process.exit(1); });
