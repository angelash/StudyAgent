"""Full local capability probe; startup/administration only, never a metadata GET.

No model or database credentials are inherited. A fresh private workspace holds
the actual DOCX/PDF self-test. This is not a source authorization decision.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import json
import sys
from types import SimpleNamespace
from paper_export_runtime import verify_dependencies, verify_install
from paper_export_protocol import error_code
from file_leases import no_links


def probe(args):
    versions = verify_dependencies()
    workspace = Path(args.workspace).absolute(); no_links(workspace)
    if workspace.exists(): raise ValueError('paper_export_output_exists')
    workspace.mkdir(parents=True, exist_ok=False)
    def progress(done, total):
        with (workspace / 'progress.json').open('w', encoding='utf8') as stream: json.dump({'stage': 'runtime', 'done': done, 'total': total}, stream)
    runtime = verify_install(args.uno_python, args.soffice, full=True, on_progress=progress)
    from paper_export_fonts import load_font_set
    fonts = load_font_set(args.font_root)
    from paper_export_document import render
    value = {'protocol': 'paper-export-document-v1', 'title': '导出工具合成自检', 'layout': {'answerLines': 0, 'breakBetweenQuestions': False}, 'media': [],
             'items': [{'id': 'runtime-probe', 'source': {'paperId': 'runtime-probe-paper', 'position': 1, 'sourceQuestionId': 'runtime-probe-question',
                         'detailSha256': '0' * 64, 'publicationVersion': 'runtime-probe-v1', 'paperTitle': '独立工具自检', 'pageNumber': None},
                        'promptHtml': '<p>合成内容，仅验证实际文件与字体：</p><p><math><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>=</mo><mn>1</mn></math></p>',
                        'optionHtml': [], 'reference': None}]}
    raw = (json.dumps(value, ensure_ascii=False) + '\n').encode('utf8')
    file = workspace / 'input.json'
    with file.open('xb') as stream: stream.write(raw)
    result = render(SimpleNamespace(workspace=str(workspace), input=str(file), input_sha256=sha256(raw).hexdigest(),
        font_root=args.font_root, uno_python=args.uno_python, soffice=args.soffice, book='practice'))
    return {'protocol': 'paper-export-capability-v1', 'available': True, 'reason': None, 'runtime': runtime, 'dependencies': versions,
            'fonts': [{'family': row['family'], 'sha256': row['sha256']} for row in fonts],
            'selfTest': [{'format': row['format'], 'sha256': row['sha256'], 'bytes': row['bytes'], 'pageCount': row['pageCount']} for row in result['files']]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['workspace', 'font-root', 'uno-python', 'soffice']: parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    try:
        result = probe(args)
        receipt = Path(args.workspace) / 'capability.json'; no_links(receipt)
        with receipt.open('x', encoding='utf8') as stream: json.dump(result, stream, indent=2)
        print('PAPER_EXPORT_CAPABILITY ' + json.dumps(result))
    except Exception as error:
        print('PAPER_EXPORT_CAPABILITY ' + json.dumps({'protocol': 'paper-export-capability-v1', 'available': False, 'reason': error_code(error, 'paper_export_runtime_invalid')}))
        raise SystemExit(1)
