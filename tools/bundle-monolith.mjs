#!/usr/bin/env node
/**
 * Bundle a monolithic schema by pulling in all per-class schemas into $defs and rewriting $ref → #/$defs/...
 *
 * Usage:
 *   node tools/bundle-monolith.mjs --top TravelProfile --out packages/core/json/TravelProfile.schema.json
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const args = process.argv.slice(2);
let topName = "TravelProfile";
let outFile = path.join(packagesDir, "core", "json", "TravelProfile.schema.json");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--top" && args[i + 1]) topName = args[++i];
  else if (args[i] === "--out" && args[i + 1]) outFile = args[++i];
}

function walkSchemas(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSchemas(full));
    else if (entry.isFile() && /[\\/]json[\\/]schemas[\\/].+\.schema\.json$/i.test(full)) out.push(full);
  }
  return out;
}
function isAbs(p) { return /^([A-Za-z]:[\\/]|\/)/.test(p); }
function absOut() { return isAbs(outFile) ? outFile : path.resolve(repoRoot, outFile); }

function loadAllSchemas() {
  const files = walkSchemas(packagesDir);
  const nodes = [];
  for (const f of files) {
    try { nodes.push({ file: f, node: JSON.parse(fs.readFileSync(f, "utf8")) }); }
    catch (e) { console.error("Failed to parse schema:", f, e.message); }
  }
  return nodes;
}

function nsPartsFromId(id) {
  // expects https://.../hatpro/<seg>/<subpath?>/<Class>.schema.json
  const m = id?.match?.(/\/hatpro\/(.+)\.schema\.json$/i);
  if (!m) return null;
  return m[1].split("/"); // [seg, ...sub, Class]
}

function putAt(bundleRoot, parts, val) {
  let cur = bundleRoot;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur.$defs ||= {};
    cur.$defs[k] ||= {};
    cur = cur.$defs[k];
  }
  cur.$defs ||= {};
  cur.$defs[parts[parts.length - 1]] = val;
}

function rewriteRefs(node, makeRef) {
  if (Array.isArray(node)) return node.map((v) => rewriteRefs(v, makeRef));
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") node.$ref = makeRef(node.$ref);
    for (const k of Object.keys(node)) if (k !== "$ref") node[k] = rewriteRefs(node[k], makeRef);
    return node;
  }
  return node;
}

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === "object") {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = sortKeysDeep(obj[k]);
    return sorted;
  }
  return obj;
}

async function main() {
  const all = loadAllSchemas();
  if (all.length === 0) { console.error("No schemas under packages/**/json/schemas"); process.exit(1); }

  // choose top by title or filename match
  const top = all.find(({ node }) => node.title === topName)
             || all.find(({ file }) => path.basename(file, ".schema.json") === `${topName}`)
             || all[0];

  if (!top) { console.error("Cannot find a top schema named:", topName); process.exit(1); }

  const bundle = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: top.node.$id?.replace(/\/[^/]+\.schema\.json$/, `/${topName}.schema.json`) || `https://example.org/hatpro/core/${topName}.schema.json`,
    title: topName,
    type: "object",
    $defs: {}
  };

  const idToNs = new Map();
  for (const { node } of all) {
    if (!node.$id) continue;
    const parts = nsPartsFromId(node.$id);
    if (parts) idToNs.set(node.$id, parts);
  }

  for (const { node } of all) {
    if (!node.$id) continue;
    const parts = idToNs.get(node.$id);
    if (!parts) continue;
    const clone = JSON.parse(JSON.stringify(node));
    delete clone.$id;
    putAt(bundle, parts, clone);
  }

  const refRewriter = (abs) => {
    const parts = idToNs.get(abs);
    return parts ? "#/$defs/" + parts.join("/$defs/") : abs; // leave external refs
  };
  rewriteRefs(bundle, refRewriter);

  const sorted = sortKeysDeep(bundle);
  await fsp.mkdir(path.dirname(absOut()), { recursive: true });
  await fsp.writeFile(absOut(), JSON.stringify(sorted, null, 2), "utf8");
  console.log("Bundled monolith written to:", absOut());
}

main().catch((err) => { console.error(err); process.exit(1); });
