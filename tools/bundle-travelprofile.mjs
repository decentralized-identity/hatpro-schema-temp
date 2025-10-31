// tools/bundle-travelprofile.mjs
// Build a single-file TravelProfile schema by bundling (or dereferencing) local components.
// No network fetches: absolute $ref that match local $id are resolved to local files.

import path from "node:path";
import url from "node:url";
import { promises as fs } from "node:fs";
import { globby } from "globby";
import $RefParser from "@apidevtools/json-schema-ref-parser";

const repoRoot = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const SCHEMAS_GLOB = "packages/**/json/schemas/**/*.schema.json";
const ENUMS_GLOB   = "packages/**/json/enums/**/*.json";

function parseArgs(argv) {
  const out = { entry: null, out: null, mode: "bundle" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--entry" && argv[i+1]) out.entry = argv[++i];
    else if (a === "--out" && argv[i+1]) out.out = argv[++i];
    else if (a === "--mode" && argv[i+1]) out.mode = argv[++i];
  }
  if (!out.entry || !out.out) {
    console.error("Usage: node tools/bundle-travelprofile.mjs --entry <schema> --out <file> [--mode bundle|deref]");
    process.exit(2);
  }
  if (!["bundle", "deref"].includes(out.mode)) {
    console.error("--mode must be 'bundle' or 'deref'");
    process.exit(2);
  }
  return out;
}
const { entry, out, mode } = parseArgs(process.argv.slice(2));

async function readJson(abs) { return JSON.parse(await fs.readFile(abs, "utf8")); }

async function buildIdRegistry() {
  const byId = new Map();
  const files = [
    ...(await globby(ENUMS_GLOB,  { cwd: repoRoot, absolute: true })),
    ...(await globby(SCHEMAS_GLOB,{ cwd: repoRoot, absolute: true }))
  ];
  for (const f of files) {
    try {
      const j = await readJson(f);
      if (j?.$id) byId.set(j.$id, { absPath: f, json: j });
    } catch { /* ignore unreadable */ }
  }
  return byId;
}

function makeIdResolver(byId) {
  return {
    order: 1,
    canRead: true,
    async read(file) {
      const u = typeof file === "string" ? file : (file.url || file.path || "");
      const hit = byId.get(u);
      if (!hit) throw new Error(`No local schema found for absolute $ref: ${u}`);
      return JSON.stringify(hit.json);
    }
  };
}

async function main() {
  const byId = await buildIdRegistry();
  const entryAbs = path.isAbsolute(entry) ? entry : path.join(repoRoot, entry);
  const outAbs   = path.isAbsolute(out)   ? out   : path.join(repoRoot, out);

  await fs.mkdir(path.dirname(outAbs), { recursive: true });

  const parser = new $RefParser();
  const options = { resolve: { file: true, http: false, ids: makeIdResolver(byId) } };

  const result = (mode === "deref")
    ? await parser.dereference(entryAbs, options)
    : await parser.bundle(entryAbs, options);

  await fs.writeFile(outAbs, JSON.stringify(result, null, 2));
  console.log(`WROTE ${path.relative(repoRoot, outAbs)} (${mode})`);
}

main().catch(e => { console.error(e); process.exit(1); });
