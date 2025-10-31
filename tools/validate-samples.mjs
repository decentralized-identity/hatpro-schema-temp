// tools/validate-samples.mjs
// Validates each auto-generated instance in json/samples/** against its matching schema.
// Pure AJV with local $id preloading; exits non-zero if any sample fails.
import { promises as fs } from "node:fs";
import path from "node:path";
import url from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import { globby } from "globby";

const repoRoot = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const toNative = (p) => path.normalize(p);

const SAMPLES_GLOB = "packages/**/json/samples/**/*.json";
const SCHEMAS_GLOB = "packages/**/json/schemas/**/*.schema.json";
const ENUMS_GLOB   = "packages/**/json/enums/**/*.json";

function parseArgs(argv) {
  const out = { debug: false, strictMap: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--debug") out.debug = true;
    else if (a === "--strict-map") out.strictMap = true;
  }
  return out;
}
const { debug, strictMap } = parseArgs(process.argv.slice(2));

function formatAjvErrors(errors) {
  if (!errors || !errors.length) return "";
  return errors.map((e, i) => {
    const loc = e.instancePath && e.instancePath.length ? e.instancePath : "/";
    const params = e.params ? JSON.stringify(e.params) : "";
    return `      [${i + 1}] path=${loc} keyword=${e.keyword} message="${e.message}" params=${params}`;
  }).join("\n");
}

function inferSchemaPathFromSample(sampleRel) {
  sampleRel = toNative(sampleRel);
  const parts = sampleRel.split(path.sep);
  const idxJson = parts.indexOf("json");
  if (idxJson < 0) throw new Error(`Cannot locate 'json' in path: ${sampleRel}`);
  const beforeJson = parts.slice(0, idxJson + 1); // packages/<seg>/json
  const afterJson = parts.slice(idxJson + 1);     // samples/...

  if (afterJson[0] !== "samples") throw new Error(`Expected 'samples' in: ${sampleRel}`);

  const postSamples = afterJson.slice(1);
  const file = postSamples.pop(); // <Name>.sample.json
  const baseName = file.replace(/\.sample\.json$/i, "");
  const schemaRel = path.join(...beforeJson, "schemas", ...postSamples, `${baseName}.schema.json`);
  return { schemaRel: toNative(schemaRel), baseName };
}

async function readJson(absPath) {
  return JSON.parse(await fs.readFile(absPath, "utf8"));
}

async function findSchemaByName(baseName) {
  const candidates = await globby(SCHEMAS_GLOB, { cwd: repoRoot, absolute: false });
  return candidates.map(toNative).filter(rel => path.basename(rel) === `${baseName}.schema.json`);
}

async function preloadAjvRefs(ajv, excludeSchemaRel) {
  const enumFiles = await globby(ENUMS_GLOB, { cwd: repoRoot, absolute: true });
  for (const abs of enumFiles) {
    try {
      const json = await readJson(abs);
      if (!json.$id) { console.warn(`[warn] enum missing $id: ${path.relative(repoRoot, abs)}`); continue; }
      ajv.addSchema(json);
    } catch (e) {
      console.warn(`[warn] failed to add enum schema: ${abs} (${String(e)})`);
    }
  }

  const schemaFiles = await globby(SCHEMAS_GLOB, { cwd: repoRoot, absolute: false });
  for (const rel of schemaFiles) {
    const nativeRel = toNative(rel);
    if (excludeSchemaRel && toNative(excludeSchemaRel) === nativeRel) continue;
    try {
      const json = await readJson(path.join(repoRoot, nativeRel));
      if (!json.$id) { console.warn(`[warn] schema missing $id: ${nativeRel}`); continue; }
      ajv.addSchema(json);
    } catch (e) {
      console.warn(`[warn] failed to add schema: ${nativeRel} (${String(e)})`);
    }
  }
}

async function main() {
  const sampleAbs = await globby(SAMPLES_GLOB, { cwd: repoRoot, absolute: true });
  if (sampleAbs.length === 0) {
    console.log("No auto-generated samples found under packages/**/json/samples/**");
    return;
  }

  let pass = 0, fail = 0;
  const results = [];

  for (const sAbs of sampleAbs) {
    const sRel = toNative(path.relative(repoRoot, sAbs));

    let schemaRel, baseName;
    try {
      ({ schemaRel, baseName } = inferSchemaPathFromSample(sRel));
    } catch (e) {
      fail++;
      results.push({ file: sRel, status: "FAIL", note: "mapping error", error: String(e) });
      continue;
    }

    let resolvedSchemaRel = schemaRel;
    let resolvedVia = "mapped";
    let schemaAbs = path.join(repoRoot, resolvedSchemaRel);

    let exists = true;
    try { await fs.access(schemaAbs); } catch { exists = false; }

    if (!exists) {
      if (strictMap) {
        fail++;
        results.push({ file: sRel, status: "FAIL", note: "schema file not found (strict map)", error: resolvedSchemaRel });
        continue;
      }
      const hits = await findSchemaByName(baseName);
      if (hits.length === 0) {
        fail++;
        results.push({ file: sRel, status: "FAIL", note: "schema not found (mapped & search)", error: schemaRel });
        continue;
      }
      if (hits.length > 1) {
        fail++;
        results.push({ file: sRel, status: "FAIL", note: "multiple schemas found (ambiguous)", error: hits.join(" | ") });
        continue;
      }
      resolvedSchemaRel = hits[0];
      resolvedVia = "search";
      schemaAbs = path.join(repoRoot, resolvedSchemaRel);
    }

    if (debug) {
      console.log(`[debug] sample=${sRel}`);
      console.log(`[debug] schema=${resolvedSchemaRel} (via ${resolvedVia})`);
      console.log(`[debug] instancePath=${sAbs}`);
    }

    const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
    addFormats(ajv);
    ajvErrors(ajv);

    await preloadAjvRefs(ajv, resolvedSchemaRel);

    try {
      const [schema, instance] = await Promise.all([readJson(schemaAbs), readJson(sAbs)]);
      const validate = ajv.compile(schema);
      const ok = validate(instance);
      if (ok) {
        pass++;
        results.push({ file: sRel, status: "PASS", note: "sample ✔" });
      } else {
        fail++;
        const errs = formatAjvErrors(validate.errors);
        results.push({ file: sRel, status: "FAIL", note: "validation failed", errors: errs });
      }
    } catch (e) {
      fail++;
      results.push({ file: sRel, status: "FAIL", note: "exception", error: String(e) });
    }
  }

  for (const r of results) {
    if (r.status === "PASS") {
      console.log(`PASS  ${r.file}  ${r.note}`);
    } else {
      console.log(`FAIL  ${r.file}  ${r.note}`);
      if (r.errors) console.log(r.errors);
      if (r.error)  console.log(`      ${r.error}`);
    }
  }

  console.log(`\nSummary: ${pass} passed, ${fail} failed, total ${pass + fail}`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
