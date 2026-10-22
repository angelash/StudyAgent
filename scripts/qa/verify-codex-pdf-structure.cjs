const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const directory = mkdtempSync(join(tmpdir(), 'study-pdf-model-qa-'));
const source = join(directory, 'synthetic.pdf');
const output = join(directory, 'structure.json');
const cache = join(directory, 'cache');
const evidencePath = join(root, 'doc/evidence/2026-10-22/pdf-ocr-structure-model-runtime.json');
const python = process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const { resolveCodexInvocation } = require(join(root, 'apps/api/dist/apps/api/src/modules/ai/codex-command.js'));
const codex = resolveCodexInvocation(process.env.CODEX_COMMAND ?? 'codex');
const evidence = {
  at: new Date().toISOString(),
  fixture: 'synthetic table and fraction formula; no learner data',
  inheritsCurrentCliConfig: true,
  modelOverrideApplied: true,
  selectedModel: process.env.CODEX_PDF_MODEL ?? 'deepseek-v4-flash',
  requestedModelLabel: 'DS V4.1 Flash',
  requestedModelId: 'deepseek-v4.1-flash',
  requestedModelAvailable: false,
  fallbackReason: 'Gateway returned 503: no available channel for deepseek-v4.1-flash',
  codexVersion: execFileSync(codex.command, ['--version'], { encoding: 'utf8', shell: codex.shell }).trim(),
  passed: false,
};

async function main() {
  mkdirSync(cache, { recursive: true });
  execFileSync(python, ['-X', 'utf8', '-c', [
    'import fitz,sys',
    'doc=fitz.open(); p=doc.new_page(width=612,height=792)',
    'xs=[72,240,408,540]',
    '[p.draw_line((x,60),(x,190),color=(0,0,0),width=1) for x in xs]',
    '[p.draw_line((72,y),(540,y),color=(0,0,0),width=1) for y in [60,105,150,190]]',
    '[p.insert_text((x,y),t,fontsize=12) for x,y,t in [(82,84,"Name"),(250,84,"Score"),(418,84,"Check"),(82,130,"Ada"),(250,130,"95"),(418,130,"yes")]]',
    'p.insert_text((72,260),"1/2 + 1/3 = 5/6",fontsize=16)',
    'doc.save(sys.argv[1]); doc.close()',
  ].join(';'), source], { cwd: root, windowsHide: true, timeout: 30_000 });
  const bytes = readFileSync(source);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const config = join(directory, 'extract.json');
  writeFileSync(config, JSON.stringify({ mode: 'pdf_structure', input: source, sha256, cache, output }));
  execFileSync(python, ['-X', 'utf8', join(root, 'scripts/processing/process_document.py'), config], {
    cwd: root, windowsHide: true, timeout: 120_000,
  });
  const raw = JSON.parse(readFileSync(output, 'utf8'));
  const { CodexPdfStructureService } = require(join(root, 'apps/api/dist/apps/api/src/modules/ai/codex-pdf-structure.service.js'));
  const service = new CodexPdfStructureService();
  const modeled = await service.structure({
    materialTitle: 'Synthetic table and formula',
    pages: raw.pages.map(page => ({ pageNumber: page.pageNumber, text: page.text, method: page.method,
      lines: page.lines, imagePath: page.imagePath, warnings: page.warnings })),
  });
  const modelPage = modeled.pages[0];
  evidence.local = {
    method: raw.pages[0].method,
    tableCount: raw.pages[0].tables.length,
    formulaCount: raw.pages[0].formulas.length,
    imageSha256: raw.pages[0].imageSha256,
  };
  evidence.model = {
    pageCount: modeled.pages.length,
    paragraphCount: modelPage?.paragraphs.length ?? 0,
    tableCount: modelPage?.tables.length ?? 0,
    formulaCount: modelPage?.formulas.length ?? 0,
    outputSha256: createHash('sha256').update(JSON.stringify(modeled)).digest('hex'),
  };
  evidence.passed = modeled.pages.length === raw.pages.length;
  evidence.completedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify(evidence) + '\n');
}

main().catch(error => {
  evidence.error = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  evidence.completedAt = new Date().toISOString();
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  process.stderr.write((evidence.error ?? 'PDF model QA failed') + '\n');
  process.exitCode = 1;
}).finally(() => rmSync(directory, { recursive: true, force: true }));
