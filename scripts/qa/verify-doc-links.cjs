#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const markdown = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() && entry.name.endsWith('.md')) markdown.push(target);
  }
}
walk(path.join(root, 'doc'));
const readme = path.join(root, 'README.md');
if (fs.existsSync(readme)) markdown.push(readme);
const missing = [];
let checked = 0;
for (const file of [...new Set(markdown)].sort()) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*```/.test(lines[index])) { fenced = !fenced; continue; }
    if (fenced) continue;
    for (const match of lines[index].matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const raw = match[1].replace(/^<|>$/g, '');
      if (/^(https?:|mailto:|tel:|#)/i.test(raw) || raw.startsWith('/')) continue;
      const local = decodeURIComponent(raw.split('#')[0].split('?')[0]);
      if (!local) continue;
      checked++;
      const target = path.resolve(path.dirname(file), local);
      if (!fs.existsSync(target)) missing.push({ file: path.relative(root, file), line: index + 1, link: raw,
        resolved: path.relative(root, target) });
    }
  }
}
const result = { checked, missing };
console.log(JSON.stringify(result, null, 2));
if (missing.length) process.exitCode = 1;