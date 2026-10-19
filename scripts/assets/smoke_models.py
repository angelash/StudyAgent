"""Run preserved local processing tools against synthetic input; never grades children."""
import importlib.util
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('data/assets').resolve()
output = Path('data/qa/model-smoke').resolve()
output.mkdir(parents=True, exist_ok=True)


def module(name):
    spec = importlib.util.spec_from_file_location('preserved_' + name, root / 'tools/shijuanbao' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


results = {'at': datetime.now(timezone.utc).isoformat(), 'syntheticInputOnly': True, 'checks': []}
started = time.monotonic()
image = Image.new('RGB', (360, 160), 'white')
draw = ImageDraw.Draw(image)
draw.text((20, 20), '3 + 2 = 5', fill='black')
draw.line([(30, 80), (80, 60), (95, 120), (160, 100)], fill='blue', width=3)
image.save(output / 'input.png')
print('handwriting-start', flush=True)
model = module('model').HandwritingModel(root / 'models/re-shijuanbao-service/local/models/handwriting-int8.onnx')
info = model.remove(output / 'input.png', output / 'output.jpg')
assert Image.open(output / 'output.jpg').size == (360, 160)
results['checks'].append({'kind': 'handwriting-inference', 'passed': True, 'result': info,
                         'qualityClaim': 'Only execution and image dimensions verified; recognition/erasure accuracy not established.'})
print('language-model-start', flush=True)
ai = module('local_ai').LocalAI(root / 'models/re-shijuanbao-service/local/models/Qwen2.5-1.5B-Instruct')
reply = ai.generate('孩子计算长方形周长时只加了长和宽，请给出一句启发式提问。')
assert reply['source'] == 'local-generated-ai' and reply['text']
results['checks'].append({'kind': 'local-language-inference', 'passed': True, 'result': reply,
                         'qualityClaim': 'Generated teaching text only; never accepted as measurement, scoring or verified diagnosis.'})
results['elapsedSeconds'] = round(time.monotonic() - started, 2)
(root / 'model-smoke.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passedChecks': len(results['checks']), 'elapsedSeconds': results['elapsedSeconds']}), flush=True)
