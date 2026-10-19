"""Build a two-page QA input from an already migrated research PDF. Never publish it."""
import hashlib
import json
from pathlib import Path
import fitz
from PIL import Image, ImageDraw

source = Path('data/assets/shijuanbao/media/0004aeabe1a3f4914e71f28b70890a7d927f12a76c22b7984ee1018364c82ba0.pdf')
output = Path('data/qa/processing-input')
output.mkdir(parents=True, exist_ok=True)
original = fitz.open(source)
page = original[0]
pixmap = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
png = output / 'original-page.png'
pixmap.save(png)
fixture = fitz.open()
fixture.insert_pdf(original, from_page=0, to_page=0)
scanned = fixture.new_page(width=page.rect.width, height=page.rect.height)
scanned.insert_image(scanned.rect, filename=str(png))
target = output / 'native-and-scanned.pdf'
fixture.save(target, garbage=4, deflate=True)
fixture.close()
original.close()
with fitz.open(target) as check:
    assert len(check) == 2 and len(check[0].get_text()) > 100 and not check[1].get_text().strip()
image = Image.open(png).convert('RGB')
draw = ImageDraw.Draw(image)
draw.line([(130, 205), (155, 225), (205, 180)], width=5, fill=(35, 90, 170))
draw.line([(175, 470), (280, 465)], width=4, fill=(35, 90, 170))
image.save(output / 'handwriting-input.png')
metadata = {'source': str(source), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourcePage': 1,
            'purpose': 'local QA only; research permission is not publication permission', 'nativePage': 1, 'rasterizedPage': 2,
            'rasterizedTextLayerEmpty': True, 'fixtureSha256': hashlib.sha256(target.read_bytes()).hexdigest()}
(output / 'provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'fixture': str(target), 'sha256': metadata['fixtureSha256'], 'pages': 2}))
