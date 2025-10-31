#!/usr/bin/env node
/**
 * Audit enum JSON files and report duplicates/mismatches.
 * Scans: packages/**/json/enums/**/*.json
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

async function main() {
  const files = walkJSON(packagesDir).filter((p) => /[\\/]json[\\/]enums[\\/].+\.json$/i.test(p));
  if (files.length === 0) { console.log("No enum files found under packages/**/json/enums"); return; }

  const seen = new Map(); // key = name/title, value = { file, values }
  let issues = 0;

  for (const f of files) {
    try {
      const txt = await fsp.readFile(f, "utf8");
      const node = JSON.parse(txt);
      const name = node.title || path.basename(f, ".json");
      const vals = Array.isArray(node.enum) ? node.enum.slice().sort() : [];

      const prev = seen.get(name);
      if (!prev) {
        seen.set(name, { file: f, values: vals });
      } else if (JSON.stringify(prev.values) !== JSON.stringify(vals)) {
        issues++;
        console.error(`Enum mismatch for '${name}':\n  ${prev.file}\n  ${f}`);
      }
    } catch (e) {
      issues++; console.error("Failed to parse enum file:", f, e.message);
    }
  }

  if (issues) { console.error(`Enum audit found ${issues} issue(s).`); process.exit(1); }
  else { console.log(`Enum audit OK (${files.length} files).`); }
}

main().catch((err) => { console.error(err); process.exit(1); });
