const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), prior = path.join(root, 'data/qa/workspace-paper-math-first-20261101');
for (const name of ['delivery-check-first.cjs', 'finalize-first.cjs', 'verify-staged-first.cjs']) {
  let source = fs.readFileSync(path.join(prior, name), 'utf8').replaceAll('workspace-r5-native-tex', 'workspace-r6-textbook-scope').replaceAll('178-paper-tex-native-math-and-book-boundaries.md', '179-textbook-scope-inventory-and-missing-lesson-worklist.md');
  if (name === 'delivery-check-first.cjs') {
    const before = "const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy-runtime.private.json'))), postgres = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'))), exactValues = [legacy.actor.token, new URL(postgres.connectionString).password];";
    if (!source.includes(before)) throw Error('Expected exact private-value guard');
    source = source.replace(before, "const first = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-first.private.json'))), second = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-second.private.json'))), postgres = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'))), exactValues = [first.nonce, first.credential, second.nonce, second.credential, new URL(postgres.connectionString).password];");
  }
  fs.writeFileSync(path.join(__dirname, name), source, { flag: 'wx' });
}
