"""Run preserved models against isolated QA material and independently verify outputs.

This checks execution and provenance, never OCR/AI teaching correctness. Run using
the intended deployment venv; no models are downloaded by this verifier.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def main(args):
    args.directory.mkdir(parents=True, exist_ok=False)
    output = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'passed': False,
              'scope': 'Real preserved handwriting and offline explanation model execution. Output hashes and manual-review flags; no teaching accuracy acceptance.', 'models': []}
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    try:
        import fitz
        from PIL import Image, ImageDraw
        source = args.assets / 'shijuanbao/media/0004aeabe1a3f4914e71f28b70890a7d927f12a76c22b7984ee1018364c82ba0.pdf'
        with fitz.open(source) as pdf:
            image = pdf[0].get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
            target = args.directory / 'synthetic-marked-page.png'
            image.save(target)
        with Image.open(target) as page:
            marked = page.convert('RGB')
        draw = ImageDraw.Draw(marked)
        draw.line([(120, 180), (170, 220), (260, 150)], fill=(25, 70, 170), width=5)
        marked.save(target)
        configurations = [
            {'mode': 'handwriting', 'input': str(target.absolute()), 'assets': str(args.assets.resolve()), 'output': str((args.directory / 'handwriting.json').absolute())},
            {'mode': 'local_explain', 'text': 'Local synthetic proofreading fixture: 1. Compute 12 + 7 = __. The printed number may be unclear. Check the original page before editing.',
             'assets': str(args.assets.resolve()), 'output': str((args.directory / 'explanation.json').absolute())},
        ]
        for configuration in configurations:
            mode = configuration['mode']
            config = args.directory / (mode + '-config.json')
            config.write_text(json.dumps(configuration), encoding='utf-8')
            environment = {key: value for key, value in os.environ.items() if key in {'PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'TEMP', 'TMP', 'LD_LIBRARY_PATH'}}
            environment.update({'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'PYTHONIOENCODING': 'utf-8'})
            started = time.monotonic()
            print('Processing models: ' + mode, flush=True)
            with (args.directory / (mode + '.log')).open('wb') as log:
                result = subprocess.run([sys.executable, '-X', 'utf8', str(args.application.resolve() / 'scripts/processing/process_document.py'), str(config.absolute())],
                                        cwd=args.application, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=900)
            if result.returncode:
                raise RuntimeError(mode + ' failed; inspect the local processing log')
            raw = Path(configuration['output']).read_bytes()
            value = json.loads(raw)
            assert value['reviewRequired'] is True and value['verifiedCorrect'] is False
            record = {'mode': mode, 'model': value['model'], 'seconds': round(time.monotonic() - started, 2),
                      'resultSha256': hashlib.sha256(raw).hexdigest(), 'reviewRequired': True, 'verifiedCorrect': False}
            if mode == 'handwriting':
                artifact = Path(value['imagePath'])
                assert artifact.resolve().parent == args.directory.resolve()
                digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
                assert digest == value['imageSha256'] and artifact.stat().st_size == value['imageSize']
                with Image.open(artifact) as image:
                    image.verify()
                record.update({'imageSha256': digest, 'imageBytes': artifact.stat().st_size})
            else:
                assert value['source'] == 'local-generated-ai' and value['promptVersion'] == 'import-review-v1'
                assert value['text'].strip()
                record.update({'promptVersion': value['promptVersion'], 'outputCharacters': len(value['text'])})
            output['models'].append(record)
        output['passed'] = True
        output['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    except Exception as error:
        output['error'] = str(error)
        raise
    finally:
        args.evidence.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': output['passed'], 'models': len(output['models'])}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['application', 'assets', 'directory', 'evidence']:
        parser.add_argument('--' + name, type=Path, required=True)
    main(parser.parse_args())
