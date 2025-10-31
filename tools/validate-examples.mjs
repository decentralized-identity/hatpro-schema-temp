// tools/validate-examples.mjs
// Validates developer-authored examples against matching schemas.
// Filters: --version vN  --segment <seg>  --only <TypeName>  [--debug] [--strict-map]
import { promises as fs } from "node:fs";
import path from "node:path";
import url from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import { globby } from "globby"; // v14+: named export

// -------- Helpers / constants --------
const toNative = (p) => path.normalize(p); // ensure OS-native separators
const repoRoot = path.dirname(path.dirname(url.fileURLToPath(import.meta.url))); // /.../repo
const SCHEMAS_GLOB = "packages/**/json/schemas/**/*.schema.json";
const ENUMS_GLOB   = "packages/**/json/enums/**/*.json";

function parseArgs(argv) {
  const out = { version: null, segment: null, only: null, debug: false, strictMap: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version" && argv[i + 1]) out.version = argv[++i];
    else if (a === "--segment" && argv[i + 1]) out.segment = argv[++i];
    else if (a === "--only" && argv[i + 1]) out.only = argv[++i];
    else if (a === "--debug") out.debug = true;
    else if (a === "--strict-map") out.strictMap = true;
  }
  return out;
}
const { version, segment, only, debug, strictMap } = parseArgs(process.argv.slice(2));

const EXAMPLES_ROOT = version
  ? `packages/**/json/examples/${version}/**/*.json`
  : `packages/**/json/examples/**/*.json`;

// --- Native AJV error formatter (no custom messages) ---
function formatAjvErrors(errors) {
  if (!errors || !errors.length) return "";
  return errors.map((e, i) => {
    const loc = e.instancePath && e.instancePath.length ? e.instancePath : "/";
    const params = e.params ? JSON.stringify(e.params) : "";
    return `      [${i + 1}] path=${loc} keyword=${e.keyword} message="${e.message}" params=${params}`;
  }).join("\n");
}

// Map example → schema (native separators in/out)
function inferSchemaPathFromExample(examplePathRel) {
  examplePathRel = toNative(examplePathRel);

  // Map:
  //   packages/<seg>/json/examples/(vN/)?<subdirs>/<Name>.<suffix>.json
  // -> packages/<seg>/json/schemas/<subdirs>/<Name>.schema.json
  const parts = examplePathRel.split(path.sep);
  const idxJson = parts.indexOf("json");
  if (idxJson < 0) throw new Error(`Cannot locate 'json' segment in path: ${examplePathRel}`);

  const beforeJson = parts.slice(0, idxJson + 1); // packages/<seg>/json
  const afterJson = parts.slice(idxJson + 1);     // examples/(vN)/...

  if (afterJson[0] !== "examples") {
    throw new Error(`Expected 'examples' folder in: ${examplePathRel}`);
  }

  let start = 1; // position after 'examples'
  if (afterJson[1] && /^v\d+$/i.test(afterJson[1])) {
    start = 2; // skip version folder if present
  }

  const postExamples = afterJson.slice(start); // <subdirs...>/<Name>.<suffix>.json
  const file = postExamples.pop();             // <Name>.<suffix>.json
  const baseName = file.split(".")[0];         // <Name>

  const schemaRel = path.join(...beforeJson, "schemas", ...postExamples, `${baseName}.schema.json`);
  return { schemaRel: toNative(schemaRel), baseName };
}

async function readJson(absPath) {
  const raw = await fs.readFile(absPath, "utf8");
  return JSON.parse(raw);
}

function matchFilters(relPathNative) {
  if (segment) {
    const segMarker = `packages${path.sep}${segment}${path.sep}`;
    if (!relPathNative.startsWith(segMarker) && !relPathNative.includes(segMarker)) return false;
  }
  if (only) {
    const base = path.basename(relPathNative);
    const baseName = base.split(".")[0];
    if (baseName !== only) return false;
  }
  return true;
}

function expectedValidityFromFilename(relPathNative) {
  const base = path.basename(relPathNative);
  if (base.includes(".valid.")) return true;
  if (base.includes(".invalid.")) return false;
  return null;
}

async function findSchemaByName(baseName) {
  const candidates = await globby(SCHEMAS_GLOB, { cwd: repoRoot, absolute: false });
  const hits = candidates
    .map(p => toNative(p))
    .filter(rel => path.basename(rel) === `${baseName}.schema.json`);
  return hits;
}

// Preload all enums and all other schemas (except the target schema) into AJV
async function preloadAjvRefs(ajv, excludeSchemaRel) {
  // Enums – these are the ones that get $ref'd by absolute $id like https://schemas.../CurrencyTypeEnum.json
  const enumFiles = await globby(ENUMS_GLOB, { cwd: repoRoot, absolute: true });
  for (const abs of enumFiles) {
    try {
      const json = await readJson(abs);
      // Must include a unique $id (your generator does this). If missing, skip with warning.
      if (!json.$id) {
        console.warn(`[warn] enum missing $id: ${path.relative(repoRoot, abs)}`);
        continue;
      }
      ajv.addSchema(json);
    } catch (e) {
      console.warn(`[warn] failed to add enum schema: ${abs} (${String(e)})`);
    }
  }

  // Other schemas – preload all except the target one to allow cross-$ref between schemas
  const schemaFiles = await globby(SCHEMAS_GLOB, { cwd: repoRoot, absolute: false });
  for (const rel of schemaFiles) {
    const nativeRel = toNative(rel);
    if (excludeSchemaRel && toNative(excludeSchemaRel) === nativeRel) continue;
    try {
      const json = await readJson(path.join(repoRoot, nativeRel));
      if (!json.$id) {
        console.warn(`[warn] schema missing $id: ${nativeRel}`);
        continue;
      }
      ajv.addSchema(json);
    } catch (e) {
      console.warn(`[warn] failed to add schema: ${nativeRel} (${String(e)})`);
    }
  }
}

// -------- Main --------
async function main() {
  const absExampleFiles = await globby(EXAMPLES_ROOT, { cwd: repoRoot, absolute: true });

  const relFiles = absExampleFiles
    .map(p => toNative(path.relative(repoRoot, p)))
    .filter(matchFilters);

  if (relFiles.length === 0) {
    console.log("No example files found for the given filters.");
    return;
  }

  let pass = 0, fail = 0;
  const results = [];

  for (const rel of relFiles) {
    const expected = expectedValidityFromFilename(rel);
    if (expected === null) {
      results.push({ file: rel, status: "SKIP", reason: "Filename must include .valid. or .invalid." });
      continue;
    }

    try {
      const { schemaRel, baseName } = inferSchemaPathFromExample(rel);
      let resolvedSchemaRel = schemaRel;
      let resolvedVia = "mapped";

      const exAbs = path.join(repoRoot, rel);
      let schemaAbs = path.join(repoRoot, resolvedSchemaRel);

      // If mapped schema doesn't exist, attempt discovery unless strict-map
      let schemaExists = true;
      try {
        await fs.access(schemaAbs);
      } catch {
        schemaExists = false;
      }

      if (!schemaExists) {
        if (strictMap) {
          fail++;
          results.push({ file: rel, status: "FAIL", note: "schema file not found (strict map)", error: resolvedSchemaRel });
          continue;
        }
        const hits = await findSchemaByName(baseName);
        if (hits.length === 0) {
          fail++;
          results.push({ file: rel, status: "FAIL", note: "schema not found (mapped & search)", error: schemaRel });
          continue;
        }
        if (hits.length > 1) {
          fail++;
          results.push({ file: rel, status: "FAIL", note: "multiple schemas found (ambiguous)", error: hits.join(" | ") });
          continue;
        }
        resolvedSchemaRel = hits[0];
        resolvedVia = "search";
        schemaAbs = path.join(repoRoot, resolvedSchemaRel);
      }

      if (debug) {
        console.log(`[debug] example=${rel}`);
        console.log(`[debug] schema =${resolvedSchemaRel} (via ${resolvedVia})`);
        console.log(`[debug] instancePath=${exAbs}`);
      }

      // Fresh AJV instance PER EXAMPLE → avoids "$id already exists"
      const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
      addFormats(ajv);
      ajvErrors(ajv);

      // Preload refs so absolute $id like https://schemas... resolve to local generated files
      await preloadAjvRefs(ajv, resolvedSchemaRel);

      const [schema, instance] = await Promise.all([
        readJson(schemaAbs),
        readJson(exAbs)
      ]);

      const validate = ajv.compile(schema);
      const ok = validate(instance);

      if (ok === expected) {
        pass++;
        results.push({ file: rel, status: "PASS", note: expected ? "valid ✔" : "invalid ✖ as expected" });
      } else {
        fail++;
        const errs = formatAjvErrors(validate.errors); // << native AJV formatting
        results.push({
          file: rel,
          status: "FAIL",
          note: expected ? "expected VALID" : "expected INVALID",
          errors: errs
        });
      }
    } catch (e) {
      fail++;
      results.push({ file: rel, status: "FAIL", note: "exception", error: String(e) });
    }
  }

  // Report
  for (const r of results) {
    if (r.status === "PASS") {
      console.log(`PASS  ${r.file}  ${r.note}`);
    } else if (r.status === "SKIP") {
      console.log(`SKIP  ${r.file}  ${r.reason}`);
    } else {
      console.log(`FAIL  ${r.file}  ${r.note}`);
      if (r.errors) console.log(r.errors);
      if (r.error)  console.log(`      ${r.error}`);
    }
  }

  console.log(`\nSummary: ${pass} passed, ${fail} failed, total ${pass + fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
