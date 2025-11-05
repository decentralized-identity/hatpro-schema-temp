// tools/compile-schemas.mjs
// Smoke test #1: compile every generated schema to catch unresolved $ref / invalid schema.
// Pure AJV; exits non-zero if any schema fails to compile.
import path from "node:path";
import url from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import { globby } from "globby";
import { promises as fs } from "node:fs";

const repoRoot = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const SCHEMAS_GLOB = "packages/**/json/schemas/**/*.schema.json";
const ENUMS_GLOB   = "packages/**/json/enums/**/*.json";

async function readJson(abs) {
  return JSON.parse(await fs.readFile(abs, "utf8"));
}

function fmt(errors) {
  if (!errors || !errors.length) return "";
  return errors.map((e, i) =>
    `  [${i+1}] keyword=${e.keyword} message="${e.message}" schemaPath=${e.schemaPath ?? ""}`
  ).join("\n");
}

async function main() {
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  ajvErrors(ajv);

  // Preload enums by $id (so absolute $ref resolves locally)
  const enums = await globby(ENUMS_GLOB, { cwd: repoRoot, absolute: true });
  for (const f of enums) {
    try {
      const j = await readJson(f);
      if (j.$id) ajv.addSchema(j);
    } catch {/* ignore */}
  }

  const schemas = await globby(SCHEMAS_GLOB, { cwd: repoRoot, absolute: true });
  let pass = 0, fail = 0;

  for (const f of schemas) {
    const rel = path.relative(repoRoot, f);
    try {
      const j = await readJson(f);
      ajv.compile(j); // throws on unresolved $ref or invalid schema
      console.log(`PASS  ${rel}  compiled`);
      pass++;
    } catch (e) {
      console.log(`FAIL  ${rel}  compile error`);
      console.log(e?.errors ? fmt(e.errors) : `  ${String(e)}`);
      fail++;
    }
  }

  console.log(`\nSummary: ${pass} compiled, ${fail} failed, total ${pass + fail}`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
