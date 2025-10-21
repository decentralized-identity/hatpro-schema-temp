#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return p;
  });
}

function loadSet(p) {
  return new Set(fs.readFileSync(p, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean));
}

const sources = {
  "iso/ISO4217.json": loadSet("sources/iso/iso4217.txt"),
  "iso/ISO3166-1-alpha2.json": loadSet("sources/iso/iso3166-alpha2.txt"),
  "iso/ISO15924.json": loadSet("sources/iso/iso15924.txt"),
};

const patternByTitle = {
  "CurrencyCode": /^[A-Z]{3}$/,
  "ISO3166-1-alpha2": /^[A-Z]{2}$/,
  "ISO15924": /^[A-Z][a-z]{3}$/,
  "ISO639-1": /^[a-z]{2}$/,
};

let failures = 0;

for (const file of walk("packages")) {
  if (!/content[\\\/]json[\\\/]enums[\\\/].+\.json$/i.test(file)) continue;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const { $id, title } = json;
  const values = Array.isArray(json.enum) ? json.enum : null;

  // Pattern check for enum codes
  const pat = patternByTitle[title];
  if (values && pat) {
    for (const v of values) {
      if (!pat.test(v)) {
        console.error(`Pattern FAIL: ${path.relative(repo, file)} → "${v}" invalid for ${title}`);
        failures++;
      }
    }
  }

  // Cross-check against curated sources if this looks like an allow-list schema
  const key = Object.keys(sources).find(k => $id && $id.endsWith(k));
  if (key && values) {
    const src = sources[key];
    const unknown = values.filter(v => !src.has(v));
    if (unknown.length) {
      console.error(`Unknown codes in ${path.relative(repo, file)}: ${unknown.join(", ")}`);
      failures++;
    }
  }
}

if (failures) process.exit(1);
console.log("Enum audit OK");
