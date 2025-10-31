#!/usr/bin/env node
/**
 * SCHEMAHINTS linter (with valuePattern + enumFrom policy)
 * - Base dir from positional arg or --packagesDir
 * - Validates SCHEMAHINTS field blocks
 * - enumDefine: allows documented keys, requires enumId
 *   * NEW: allows "valuePattern", "x-standard", "x-standardRef"
 *   * NEW: validates RegExp(valuePattern)
 * - enumFrom: warning by default; error with --forbidEnumFrom
 * - Always errors if enumFrom appears inside enumDefine
 * - --checkTargets verifies derived enum JSON exists
 * - Outputs text (default) or JSON (--format=json), optional --out=FILE
 * - Exit codes: 0(ok), 1(warnings w/ --strict), 2(errors)
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);

let baseDir = null;
let checkTargets = false;
let format = 'text';
let outFile = null;
let strict = false;
let forbidEnumFrom = false;

// Parse CLI
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('-') && !baseDir) { baseDir = a; continue; }
  if (a === '--packagesDir') {
    const v = argv[i + 1];
    if (v && !v.startsWith('-')) { baseDir = v; i++; }
  } else if (a === '--checkTargets') {
    checkTargets = true;
  } else if (a.startsWith('--format')) {
    const v = a.includes('=') ? a.split('=')[1] : argv[i + 1];
    if (v) { format = v.trim(); if (!a.includes('=')) i++; }
  } else if (a.startsWith('--out')) {
    const v = a.includes('=') ? a.split('=')[1] : argv[i + 1];
    if (v) { outFile = v.trim(); if (!a.includes('=')) i++; }
  } else if (a === '--strict') {
    strict = true;
  } else if (a === '--forbidEnumFrom') {
    forbidEnumFrom = true;
  }
}

if (!baseDir) baseDir = './packages';
if (!fs.existsSync(baseDir)) {
  console.error(`Packages dir not found: ${baseDir}`);
  process.exit(2);
}

function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.puml')) out.push(full);
  }
  return out;
}
function readLines(p){ return fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n').split('\n'); }
function push(ary, type, file, line, msg){ ary.push({ type, file, line, message: msg }); }

const allowedEnumKeys = new Set([
  'enumId','targetPath','sourcePath','title','type','generate','enum',
  'x-enumNames','x-enumDescriptions','x-order','x-deprecated','x-aliases',
  'description','valuePattern','x-standard','x-standardRef'
]);

function lintFile(fileAbs, rootDir, { checkTargets, forbidEnumFrom }) {
  const rel = path.relative(rootDir, fileAbs).replace(/\\/g,'/');
  const lines = readLines(fileAbs);
  const issues = [];

  for (let i=0;i<lines.length;i++){
    const l = lines[i];
    if (!/^\s*SCHEMAHINTS\b/.test(l)) continue;

    for (let j=i+1;j<lines.length;j++){
      const l2 = lines[j];

      // FIELD start
      const mField = l2.match(/^\s*field\s+([A-Za-z0-9_\-]+)\s*:\s*$/);
      if (mField){
        const fieldName = mField[1];
        let k = j+1;
        let sawDirective = false;
        let enumPath = null;
        let enumMode = null; // 'from' | 'define'

        if (k<lines.length && /^\s*$/.test(lines[k])){
          push(issues, 'errors', rel, k+1, `Blank line directly after "field ${fieldName}:"`);
        }

        for (; k<lines.length; k++){
          const l3 = lines[k];
          if (/^\s*field\s+/.test(l3) || /^\s*end\s+note\b/.test(l3) || /^\s*SCHEMAHINTS\b/.test(l3)) break;
          if (/^\s*$/.test(l3)) continue;

          // enumFrom directly under field
          const mEF = l3.match(/^\s*enumFrom:\s*(\S+)\s*$/);
          if (mEF){
            sawDirective = true;
            enumMode = 'from';
            enumPath = mEF[1];
            const severity = forbidEnumFrom ? 'errors' : 'warnings';
            push(issues, severity, rel, k+1, `enumFrom used (policy: prefer enumDefine+enumId)`);
            if (!enumPath.startsWith('/')){
              push(issues, 'errors', rel, k+1, `enumFrom must start with "/" (got "${enumPath}")`);
            }
            continue;
          }

          // enumDefine start
          const mED = l3.match(/^\s*enumDefine:\s*$/);
          if (mED){
            sawDirective = true;
            enumMode = 'define';

            const baseIndent = l3.match(/^(\s*)/)[1].length;
            let haveEnumId = false;
            for (let z=k+1; z<lines.length; z++){
              const l4 = lines[z];
              const indent = l4.match(/^(\s*)/)[1].length;
              if (indent <= baseIndent || /^\s*field\s+/.test(l4) || /^\s*end\s+note\b/.test(l4)){
                k = z-1; break;
              }
              if (/^\s*$/.test(l4)){
                push(issues, 'warnings', rel, z+1, 'Blank line inside enumDefine block');
                continue;
              }
              const kv = l4.match(/^\s*([A-Za-z0-9\-\$]+)\s*:\s*(.*)$/);
              if (kv){
                const key = kv[1];
                const val = kv[2].trim();

                if (key === 'enumFrom'){
                  push(issues, 'errors', rel, z+1, 'enumFrom is not allowed inside enumDefine; use enumId or move enumFrom directly under field');
                }

                if (!allowedEnumKeys.has(key)){
                  push(issues, 'warnings', rel, z+1, `Unknown enumDefine key "${key}"`);
                }
                if (key === 'enumId'){
                  haveEnumId = true;
                  enumPath = val;
                  if (!enumPath.startsWith('/')){
                    push(issues, 'errors', rel, z+1, `enumDefine.enumId must start with "/" (got "${enumPath}")`);
                  }
                }
                if (key === 'enum'){
                  const ok = /^\[.*\]$/.test(val) || val.includes(',') || val === '' || /^- /.test(val);
                  if (!ok) push(issues, 'warnings', rel, z+1, 'enumDefine.enum has an unrecognized list syntax');
                }
                if (key === 'valuePattern'){
                  try { new RegExp(val); }
                  catch {
                    push(issues, 'errors', rel, z+1, `valuePattern is not a valid regex: ${val}`);
                  }
                }
              }
            }
            if (!haveEnumId){
              push(issues, 'errors', rel, k+1, 'enumDefine is missing "enumId:"');
            }
            continue;
          }

          // any non-empty line counts as a directive
          if (/\S/.test(l3)) sawDirective = true;
        } // end inner loop

        if (!sawDirective){
          push(issues, 'errors', rel, j+1, `No directives found under "field ${fieldName}:" — expected enumDefine or enumFrom`);
        }

        // Target existence checks
        if (checkTargets && enumPath && (enumMode === 'from' || enumMode === 'define')){
          const parts = enumPath.replace(/^\/+/, '').split('/');
          if (parts.length >= 2){
            const seg = parts.shift();
            const rest = parts;
            const name = rest.pop();
            const enumFile = path.join(baseDir, seg, 'json', 'enums', ...rest, `${name}.json`);
            if (!fs.existsSync(enumFile)){
              push(issues, 'errors', rel, j+1, `enum target not found: ${path.relative(process.cwd(), enumFile).replace(/\\/g,'/')}`);
            }
          }
        }

        j = k - 1;
      } // end field
    } // end note scan
  } // end lines

  return issues;
}

// Run
const pumlFiles = walk(baseDir).filter(f => /[/\\]puml[/\\]/i.test(f));
const allIssues = [];
for (const f of pumlFiles){
  allIssues.push(...lintFile(f, baseDir, { checkTargets, forbidEnumFrom }));
}
const errors = allIssues.filter(i => i.type === 'errors');
const warnings = allIssues.filter(i => i.type === 'warnings');

const report = { baseDir, filesScanned: pumlFiles.length, issues: allIssues };

let exitCode = 0;
if (errors.length > 0) exitCode = 2;
else if (strict && warnings.length > 0) exitCode = 1;

if (format === 'json'){
  const json = JSON.stringify(report, null, 2);
  if (outFile) fs.writeFileSync(outFile, json, 'utf8'); else process.stdout.write(json + '\n');
} else {
  const out = [];
  out.push(`SCHEMAHINTS Lint Report`);
  out.push(`Base: ${baseDir}`);
  out.push(`Files: ${pumlFiles.length}`);
  out.push(`Errors: ${errors.length}  Warnings: ${warnings.length}${strict ? ' (strict)' : ''}`);
  out.push('');
  for (const it of allIssues){
    out.push(`${it.type.toUpperCase()}: ${it.file}:${it.line}  ${it.message}`);
  }
  const txt = out.join('\n');
  if (outFile) fs.writeFileSync(outFile, txt, 'utf8'); else process.stdout.write(txt + '\n');
}

process.exit(exitCode);
