from pathlib import Path
from hashlib import sha256
import json, sys
qa = Path(__file__).resolve().parent
repo = qa.parents[2]
sys.path.insert(0, str(repo / 'data/qa/p180/scripts/processing'))
from paper_export_content import parse_markup
from paper_export_fonts import load_font_set
fonts = load_font_set(repo / 'data/qa/er2/fonts')
rows = []
for value in [r'<p>ORIGINAL \(\frac{1}{2}+x^2\)</p>', r'<p>ORIGINAL \[\sqrt[3]{8}\]</p>', r'<p>ORIGINAL $$x_1^2$$</p>']:
    try:
        parse_markup(value, {}, fonts)
        raise AssertionError('Original baseline unexpectedly accepted literal TeX')
    except ValueError as error:
        assert str(error) == 'paper_export_unsupported_markup'
        rows.append({'original': value, 'originalSha256': sha256(value.encode()).hexdigest(), 'reason': str(error)})
result = {'expectedBaselineRejections': rows, 'noPublishedSources': True, 'source': {name: sha256((repo / 'data/qa/p180/scripts/processing' / name).read_bytes()).hexdigest() for name in ['paper_export_content.py', 'paper_export_math.py']}}
with (qa / 'baseline-first.json').open('x', encoding='utf8') as stream: json.dump(result, stream, indent=2)
print(json.dumps({'expectedRejections': len(rows), 'actualProductionParser': True}))
