from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,sys
base=Path(__file__).parent/(sys.argv[1] if len(sys.argv)>1 else 'browser-first')
names=['garden-five-time-components-and-reading', 'picture-riddle-reading', 'raising-flag-language-reading', 'schoolbag-tools-and-organization', 'size-and-number-literacy', 'sun-moon-character-components']
out=base/'derived';out.mkdir(exist_ok=False)
receipts=[]
for kind in ['table','mobile']:
 for start in range(0,len(names),3):
  files=[f'chinese-g1-a692a990-{n}-v1-{kind}.png' for n in names[start:start+3]]
  images=[Image.open(base/file).convert('RGB') for file in files]
  width=max(im.width for im in images) if kind=='table' else sum(im.width for im in images)
  height=sum(im.height+28 for im in images) if kind=='table' else max(im.height for im in images)+28
  canvas=Image.new('RGB',(width,height),'white');draw=ImageDraw.Draw(canvas);x=y=0;positions=[]
  for file,im in zip(files,images):
   draw.text((x+5,y+5),file,fill='black');canvas.paste(im,(x,y+28));positions.append({'source':file,'sourceSha256':hashlib.sha256((base/file).read_bytes()).hexdigest(),'paste':[x,y+28],'size':list(im.size),'resized':False})
   if kind=='table':y+=im.height+28
   else:x+=im.width
  file=f'{kind}-{start//3+1}.png';canvas.save(out/file);receipts.append({'file':file,'sources':positions})
(out/'manifest.json').write_text(json.dumps({'sheets':receipts,'allPixelsCopiedWithoutResize':True},indent=2)+'\n')
