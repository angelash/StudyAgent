#!/usr/bin/env node
// Dependency-free ratchet for two kinds of technical debt until ESLint/Prettier are installed:
//   1. direct InMemoryStoreService collection access (store.<collection>) in API source;
//      it clones the whole collection and registers a whole-collection commit dependency.
//      Use store.find/select/inspect/append/remove instead.
//   2. over-long source lines, which make human review and diffs impractical.
// Counts may only go down. A file may not exceed its baseline; new files start at zero.
//   node scripts/qa/check-code-health.cjs            check against the baseline
//   node scripts/qa/check-code-health.cjs --update   rewrite the baseline (only after reductions)
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const baselineFile = path.join(__dirname, 'code-health-baseline.json');
const LONG_LINE = 240;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'generated', 'coverage', '__pycache__']);

function walk(directory, accept, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(path.join(directory, entry.name), accept, files); }
    else if (accept(entry.name)) files.push(path.join(directory, entry.name));
  }
  return files;
}
const relative = file => path.relative(root, file).split(path.sep).join('/');
const isTs = name => /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts');

function storeCollections() {
  const source = fs.readFileSync(path.join(root, 'apps/api/src/infrastructure/in-memory-store.service.ts'), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*)(?:\??:[^=;\n]+)?\s*=\s*\[\];/gm)) names.add(match[1]);
  if (names.size < 50) throw new Error(`Only ${names.size} store collections were recognized; update the collection pattern`);
  return names;
}

function measure() {
  const collections = storeCollections();
  const directStoreAccess = {};
  const apiFiles = walk(path.join(root, 'apps/api/src'), name => isTs(name) && !/\.(test|scenarios)\.ts$/.test(name));
  for (const file of apiFiles) {
    if (file.endsWith(path.join('infrastructure', 'in-memory-store.service.ts'))) continue;
    const source = fs.readFileSync(file, 'utf8');
    let count = 0;
    for (const match of source.matchAll(/\bstore\.([A-Za-z][A-Za-z0-9]*)\b(?!\s*\()/g)) if (collections.has(match[1])) count++;
    if (count) directStoreAccess[relative(file)] = count;
  }
  const longLines = {};
  const sourceRoots = ['apps/api/src', 'apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/contracts/src', 'packages/config/src', 'packages/ui/src', 'tests/e2e'];
  for (const sourceRoot of sourceRoots) {
    for (const file of walk(path.join(root, sourceRoot), isTs)) {
      // Windows checkouts use CRLF; count characters without the line ending on every platform.
      const count = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.length > LONG_LINE).length;
      if (count) longLines[relative(file)] = count;
    }
  }
  return { directStoreAccess, longLines };
}

const total = record => Object.values(record).reduce((sum, value) => sum + value, 0);
const current = measure();

if (process.argv.includes('--update')) {
  const sorted = record => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(baselineFile, JSON.stringify({
    format: 'code-health-baseline-v1', longLineThreshold: LONG_LINE,
    totals: { directStoreAccess: total(current.directStoreAccess), longLines: total(current.longLines) },
    directStoreAccess: sorted(current.directStoreAccess), longLines: sorted(current.longLines),
  }, null, 2) + '\n');
  process.stdout.write(`Baseline written: ${total(current.directStoreAccess)} direct store accesses, ${total(current.longLines)} lines over ${LONG_LINE} characters.\n`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const violations = [];
for (const metric of ['directStoreAccess', 'longLines']) {
  for (const [file, count] of Object.entries(current[metric])) {
    const allowed = baseline[metric][file] ?? 0;
    if (count > allowed) violations.push(`${metric}: ${file} has ${count}, baseline allows ${allowed}`);
  }
}
const summary = `direct store accesses ${total(current.directStoreAccess)} (baseline ${baseline.totals.directStoreAccess}), ` +
  `lines over ${LONG_LINE} characters ${total(current.longLines)} (baseline ${baseline.totals.longLines})`;
if (violations.length) {
  process.stderr.write(`Code health regressed:\n  ${violations.join('\n  ')}\n` +
    'Use store.find/select/inspect/append/remove instead of store.<collection>, and wrap long lines.\n');
  process.exit(1);
}
const improved = total(current.directStoreAccess) < baseline.totals.directStoreAccess || total(current.longLines) < baseline.totals.longLines;
process.stdout.write(`Code health OK: ${summary}.${improved ? ' Counts went down; run with --update to lock in the improvement.' : ''}\n`);
