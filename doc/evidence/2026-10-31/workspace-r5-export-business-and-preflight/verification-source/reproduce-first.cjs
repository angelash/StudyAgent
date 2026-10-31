const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const candidate = path.resolve(__dirname, '../p174'); require('node:module').createRequire(path.join(candidate, 'package.json'))('tsx/cjs');
const { fixture } = require(path.join(candidate, 'apps/api/src/modules/library/paper-export-fixture.spec.ts'));
const { buildPaperExportDocument } = require(path.join(candidate, 'apps/api/src/modules/library/paper-export-document-source.ts'));
const { paperExportDocumentBytes, paperExportDocumentSha256 } = require(path.join(candidate, 'apps/api/src/modules/library/paper-export-record.ts'));
(async () => {
  const f = fixture(), picture = path.join(candidate, 'data/qa/paper-export-business-9dDu3B/paper-assets/shijuanbao/media/figure.png');
  const content = fs.readFileSync(picture), hash = require('node:crypto').createHash('sha256').update(content).digest('hex');
  let sourceFailure = null;
  try { await buildPaperExportDocument({ title: 'Synthetic', layout: f.document.layout, resolved: [{ item: f.items[0], original: { title: '<img src="https://synthetic.example/image.png" alt="image">', options: [], answer: null, details: null } }], repo: { media: () => ({ path: picture, size: content.length, sha256: hash }) } }); }
  catch (error) { sourceFailure = error.stack; }
  const document = { ...f.document, title: 'Synthetic', items: [{ ...f.document.items[0], source: { ...f.document.items[0].source, paperTitle: 'Original' }, promptHtml: '<img src="media/' + hash + '.png" alt="image">', optionHtml: [], reference: null }], media: [{ path: 'media/' + hash + '.png', sha256: hash, bytes: content.length, width: 400, height: 180 }] };
  const config = JSON.parse(fs.readFileSync(path.resolve(candidate, '../er2/installation.json'), 'utf8').replace(/^\ufeff/, ''));
  const code = "import sys,json,base64,traceback; sys.path.insert(0,sys.argv[1]); from paper_export_content import load_input; from paper_export_fonts import load_font_set; wire=json.load(sys.stdin); load_input(None,wire['inputSha256'],None,load_font_set(sys.argv[2]),'practice',raw_bytes=base64.b64decode(wire['document']),media_bytes={row['path']:base64.b64decode(row['data']) for row in wire['media']})";
  const wire = JSON.stringify({ inputSha256: paperExportDocumentSha256(document), document: paperExportDocumentBytes(document).toString('base64'), media: [{ path: document.media[0].path, data: content.toString('base64') }] });
  const result = spawnSync(config.python, ['-E', '-s', '-B', '-X', 'utf8', '-c', code, path.join(candidate, 'scripts/processing'), config.fontRoot], { windowsHide: true, input: wire, encoding: 'utf8', timeout: 20000 });
  const report = { at: new Date().toISOString(), sourceFailure, actualPython: { exit: result.status, stdout: result.stdout, stderr: result.stderr }, syntheticOnly: true };
  fs.writeFileSync(path.join(__dirname, 'reproduce-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ sourceFailure: sourceFailure?.split('\n')[0], pythonExit: result.status, lastError: result.stderr.trim().split('\n').at(-1) }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
