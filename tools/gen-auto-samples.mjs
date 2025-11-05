// tools/gen-auto-samples.mjs
// Smoke test #2: for each generated schema, try to synthesize a minimal instance,
// write it to json/samples/**, and (optionally) validate it.
// Usage:
//   node tools/gen-auto-samples.mjs [--validate] [--strict] [--debug]
import { promises as fs } from "node:fs";
import path from "node:path";
import url from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import { globby } from "globby";

const repoRoot = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const SCHEMAS_GLOB = "packages/**/json/schemas/**/*.schema.json";
const ENUMS_GLOB   = "packages/**/json/enums/**/*.json";

function parseArgs(argv) {
  const out = { validate: false, strict: false, debug: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--validate") out.validate = true;
    else if (a === "--strict") out.strict = true;
    else if (a === "--debug") out.debug = true;
  }
  return out;
}
const { validate, strict, debug } = parseArgs(process.argv.slice(2));

async function readJson(abs) { return JSON.parse(await fs.readFile(abs, "utf8")); }
async function writeJson(abs, obj) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(obj, null, 2));
}

function destForSample(schemaRel) {
  // packages/<seg>/json/schemas/<subdir>/<Name>.schema.json
  // → packages/<seg>/json/samples/<subdir>/<Name>.sample.json
  const parts = schemaRel.split(path.sep);
  const i = parts.indexOf("json");
  const before = parts.slice(0, i + 1); // packages/<seg>/json
  const after = parts.slice(i + 2);     // skip 'schemas'
  const file = after.pop();             // <Name>.schema.json
  const base = file.replace(/\.schema\.json$/i, "");
  return path.join(...before, "samples", ...after, `${base}.sample.json`);
}

// Minimal sampler for common constructs. Skips hard cases with a warning.
function makeSampler(registry, debug) {
  const MAX_DEPTH = 6;
  const log = (m) => { if (debug) console.log(`[sampler] ${m}`); };

  function resolveRef(schema) {
    if (schema && schema.$ref) {
      const tgt = registry.byId.get(schema.$ref);
      if (!tgt) throw new Error(`unresolved $ref: ${schema.$ref}`);
      return tgt;
    }
    return schema;
  }

  function firstDef(...vals) { return vals.find(v => v !== undefined); }

  function sample(schema, depth = 0) {
    if (!schema || depth > MAX_DEPTH) return null;
    schema = resolveRef(schema);

    if (schema.allOf) {
      return schema.allOf.reduce((acc, s) => Object.assign(acc || {}, sample(s, depth + 1) || {}), {});
    }
    if (schema.oneOf || schema.anyOf) {
      const branch = (schema.oneOf || schema.anyOf)[0];
      log(`${schema.oneOf ? "oneOf" : "anyOf"} → picking first`);
      return sample(branch, depth + 1);
    }
    if (schema.if) {
      return sample(schema.then || schema.else || {}, depth + 1);
    }

    if (schema.const !== undefined) return schema.const;
    if (schema.enum && schema.enum.length) return schema.enum[0];

    const typ = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    function sampleString() {
      if (schema.pattern) return null; // conservative: don't guess pattern-matching value
      if (schema.format === "date-time") return "2025-01-01T00:00:00Z";
      if (schema.format === "date") return "2025-01-01";
      if (schema.format === "time") return "00:00:00";
      if (schema.format === "email") return "user@example.org";
      if (schema.format === "uri" || schema.format === "url") return "https://example.org";
      if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000000";
      if (schema.minLength && schema.minLength > 0) return "x".repeat(schema.minLength);
      return "";
    }

    switch (typ) {
      case "object": {
        const o = {};
        const req = schema.required || [];
        const props = schema.properties || {};
        for (const k of req) {
          const sub = props[k] || {};
          const v = sample(sub, depth + 1);
          o[k] = (v === null)
            ? (sub.type === "string" ? "" : 0) // placeholder if we couldn't synthesize
            : v;
        }
        return o;
      }
      case "array": {
        const min = firstDef(schema.minItems, 0);
        const items = schema.items || {};
        const n = Math.max(min, 0);
        const arr = [];
        for (let i = 0; i < n; i++) {
          const v = sample(items, depth + 1);
          arr.push(v === null ? (items?.type === "string" ? "" : 0) : v);
        }
        if (n === 0) {
          const v = sample(items, depth + 1);
          arr.push(v === null ? (items?.type === "string" ? "" : 0) : v);
        }
        return arr;
      }
      case "number":
      case "integer":
        if (schema.minimum !== undefined) return schema.minimum;
        if (schema.exclusiveMinimum !== undefined) return schema.exclusiveMinimum;
        return 0;
      case "boolean":
        return false;
      case "null":
        return null;
      case "string": {
        const s = sampleString();
        return s === null ? "" : s;
      }
      default: {
        if (schema.properties || schema.required) return sample({ type: "object", ...schema }, depth + 1);
        if (schema.items) return sample({ type: "array", ...schema }, depth + 1);
        return null;
      }
    }
  }

  return { sample };
}

async function main() {
  const schemaFiles = await globby(SCHEMAS_GLOB, { cwd: repoRoot, absolute: true });
  if (schemaFiles.length === 0) {
    console.log("No schemas found.");
    return;
  }

  // Build a $id registry for $ref resolving
  const registry = { byId: new Map(), byRel: new Map() };

  const enumFiles = await globby(ENUMS_GLOB, { cwd: repoRoot, absolute: true });
  for (const f of [...enumFiles, ...schemaFiles]) {
    try {
      const j = await readJson(f);
      if (j.$id) registry.byId.set(j.$id, j);
      registry.byRel.set(path.relative(repoRoot, f), j);
    } catch { /* ignore */ }
  }

  // Optional AJV validator
  let ajv;
  if (validate) {
    ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
    addFormats(ajv);
    ajvErrors(ajv);
    for (const j of registry.byId.values()) {
      try { ajv.addSchema(j); } catch { /* ignore */ }
    }
  }

  const sampler = makeSampler(registry, debug);

  let produced = 0, skipped = 0, failed = 0, invalid = 0;

  for (const abs of schemaFiles) {
    const rel = path.relative(repoRoot, abs);
    const destRel = destForSample(rel);

    let schema;
    try {
      schema = await readJson(abs);
    } catch (e) {
      console.log(`FAIL  ${rel}  read error: ${String(e)}`);
      failed++;
      continue;
    }

    let instance = null;
    try {
      instance = sampler.sample(schema);
      if (instance === null) {
        console.log(`SKIP  ${rel}  no-sample (ambiguous or unsupported)`);
        skipped++;
        if (strict) failed++;
        continue;
      }
    } catch (e) {
      console.log(`FAIL  ${rel}  sample error: ${String(e)}`);
      failed++;
      continue;
    }

    if (validate && ajv) {
      try {
        const validateFn = ajv.compile(schema);
        const ok = validateFn(instance);
        if (!ok) {
          console.log(`FAIL  ${rel}  synthesized instance invalid`);
          for (const [i, err] of (validateFn.errors || []).entries()) {
            const where = err.instancePath || "/";
            console.log(`      [${i + 1}] path=${where} keyword=${err.keyword} message="${err.message}"`);
          }
          invalid++;
          if (strict) failed++;
        }
      } catch (e) {
        console.log(`FAIL  ${rel}  compile/validate error: ${String(e)}`);
        failed++;
        continue;
      }
    }

    try {
      const outAbs = path.join(repoRoot, destRel);
      await writeJson(outAbs, instance);
      console.log(`WROTE ${destRel}`);
      produced++;
    } catch (e) {
      console.log(`FAIL  ${rel}  write error: ${String(e)}`);
      failed++;
    }
  }

  console.log(`\nSummary: produced ${produced}, skipped ${skipped}, invalid ${invalid}, failed ${failed}`);
  if (failed > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
