"""Read the isolated LibreOffice equation font properties of a synthetic DOCX."""
from pathlib import Path
import json, subprocess, time, uuid, sys
import uno
from com.sun.star.beans import PropertyValue

qa = Path(__file__).resolve().parent
repo = qa.parents[2]
program = repo / 'data/tools/libreoffice-26.8.2/program'
profile = qa / 'uno-font-query-second-profile'
profile.mkdir(exist_ok=False)
pipe = 'study_paper_font_' + uuid.uuid4().hex
command = [str(program / 'soffice.com'), '-env:UserInstallation=' + profile.as_uri(), '--headless', '--invisible',
           '--norestore', '--nodefault', '--nofirststartwizard', '--accept=pipe,name=' + pipe + ';urp;StarOffice.ComponentContext']
process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
desktop = doc = None
try:
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    context = None
    last_error = None
    for _ in range(400):
        try: context = resolver.resolve('uno:pipe,name=' + pipe + ';urp;StarOffice.ComponentContext'); break
        except Exception as exc:
            last_error = str(exc)
            if process.poll() is not None: break
            time.sleep(0.1)
    if context is None: raise RuntimeError('Isolated UNO startup failed: exit=' + str(process.poll()) + ' last=' + str(last_error))
    desktop = context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
    def prop(name, value):
        item = PropertyValue(); item.Name = name; item.Value = value; return item
    source = qa / 'portable-font-probe-second/portable-fonts.docx'
    doc = desktop.loadComponentFromURL(source.as_uri(), '_blank', 0,
        (prop('Hidden', True), prop('ReadOnly', True), prop('MacroExecutionMode', 4), prop('UpdateDocMode', 0)))
    if not doc: raise RuntimeError('Synthetic DOCX did not load')
    objects = doc.getEmbeddedObjects()
    result = []
    for name in objects.getElementNames():
        item = objects.getByName(name)
        properties = [p.Name for p in item.getPropertySetInfo().getProperties()]
        model = item.Model
        values = {}
        for p in model.getPropertySetInfo().getProperties():
            if 'Font' in p.Name:
                try:
                    value = model.getPropertyValue(p.Name)
                    if isinstance(value, (str, bool, int, float)): values[p.Name] = value
                except Exception: pass
        result.append({'name': name, 'textObjectProperties': properties, 'mathFontValues': values})
    report = {'scope': __doc__, 'source': str(source.relative_to(qa)), 'objects': result,
              'readOnly': True, 'systemConfigurationChanged': False, 'sourceChanged': False}
    with (qa / 'uno-math-font-query-second.json').open('x', encoding='utf8') as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
    print(json.dumps({'objects': result}, ensure_ascii=True))
finally:
    if doc: doc.close(True)
    if desktop: desktop.terminate()
    try: stdout, stderr = process.communicate(timeout=15)
    except subprocess.TimeoutExpired: process.kill(); stdout, stderr = process.communicate(timeout=5)
    (qa / 'uno-font-query-second-process.json').write_text(json.dumps({'exit':process.returncode,'stdout':stdout.decode('utf8',errors='replace'),'stderr':stderr.decode('utf8',errors='replace')}),encoding='utf8')
