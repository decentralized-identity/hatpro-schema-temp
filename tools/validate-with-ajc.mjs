#!/usr/bin/env node
/**
 * Validate all generated schemas with Ajv (draft 2020-12).
 * Loads all schemas and enums into Ajv, then compiles each schema with others as refs.
 *
 * Usage:
 *   node tools/validate-with-ajc.mjs --baseId https://example.org/hatpro/
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import addErrors from "ajv-errors";

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
const repoRoot   = findRepoRoot(path.resolve(__dirname, ".."));
const packagesDir = path.join(repoRoot, "packages");
/* -------------------------------------------- */

const argv = process.argv.slice(2);
let forcedBaseId = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--baseId" && argv[i + 1]) {
    forcedBaseId = argv[++i];
    if (!forcedBaseId.endsWith("/")) forcedBaseId += "/";
  }
}

function walkJSON(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJSON(full));
    else if (entry.isFile() && /\.json$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function loadSchemas(ajv) {
  const files = walkJSON(packagesDir).filter((p) => /[\\/]json[\\/]schemas[\\/].+\.schema\.json$/i.test(p));
  const loaded = [];
  for (const f of files) {
    const txt = await fsp.readFile(f, "utf8");
    const sch = JSON.parse(txt);
    if (sch.$id) {
      try { ajv.addSchema(sch); loaded.push(sch); }
      catch (e) { console.error("addSchema failed:", f, e.message); }
    }
  }
  return loaded;
}

async function loadEnums(ajv, absoluteBaseId) {
  const files = walkJSON(packagesDir).filter((p) => /[\\/]json[\\/]enums[\\/].+\.json$/i.test(p));
  let count = 0;
  for (const f of files) {
    try {
      const txt = await fsp.readFile(f, "utf8");
      const node = JSON.parse(txt);
      let id = node.$id;
      if (!id) {
        const rel = path.relative(packagesDir, f).replace(/\\/g, "/").replace(/^([^/]+)\/json\//, "$1/");
        id = absoluteBaseId + rel;
      }
      node.$id = id;
      ajv.addSchema(node); count++;
    } catch (e) { console.error("enum addSchema failed:", f, e.message); }
  }
  return count;
}

async function main() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  addErrors(ajv);

  const schemas = await loadSchemas(ajv);

  let absoluteBaseId = null;
  for (const sch of schemas) {
    const id = sch.$id || "";
    if (/^https?:\/\//i.test(id)) {
      const m = id.match(/^(https?:\/\/[^/]+\/.*?hatpro\/)/i);
      if (m) { absoluteBaseId = m[1]; break; }
    }
  }
  if (!absoluteBaseId) {
    absoluteBaseId = forcedBaseId || "https://example.org/hatpro/";
  }

  const enumsLoaded = await loadEnums(ajv, absoluteBaseId);

  let failures = 0;
  for (const sch of schemas) {
    try { ajv.compile(sch); }
    catch (e) { console.error("✗ compile failed:", sch.$id || "(no $id)", e.message); failures++; }
  }

  if (failures > 0) {
    console.error(`Validation failed: ${failures} schema(s) not compiling`);
    process.exit(1);
  } else {
    console.log(`All schemas compiled successfully (${schemas.length} schemas, ${enumsLoaded} enum files).`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
