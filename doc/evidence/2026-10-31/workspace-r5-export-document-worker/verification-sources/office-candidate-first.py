"""Local per-document Office rendering. Invoked with the configured UNO runtime."""
from pathlib import Path
from hashlib import sha256
import argparse, json, os, subprocess, sys, time, uuid
import uno
from com.sun.star.beans import PropertyValue

PROTOCOL = 'paper-export-office-v1'


def property_value(name, value):
    item = PropertyValue(); item.Name = name; item.Value = value; return item


def render(source, expected_sha256, destination, profile, executable, cancelled):
    source, destination, profile, cancelled = map(Path, [source, destination, profile, cancelled])
    if not source.is_file() or sha256(source.read_bytes()).hexdigest() != expected_sha256 or destination.exists() or profile.exists():
        raise ValueError('paper_export_source_changed')
    if cancelled.exists(): raise ValueError('paper_export_cancelled')
    profile.mkdir(parents=True, exist_ok=False)
    pipe = 'study_paper_' + uuid.uuid4().hex
    arguments = [str(executable), '-env:UserInstallation=' + profile.resolve().as_uri(), '--headless', '--invisible', '--norestore',
                 '--nodefault', '--nofirststartwizard', '--accept=pipe,name=' + pipe + ';urp;StarOffice.ComponentContext']
    process = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
    document = desktop = None
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        context = None
        for _ in range(450):
            if cancelled.exists(): raise ValueError('paper_export_cancelled')
            try: context = resolver.resolve('uno:pipe,name=' + pipe + ';urp;StarOffice.ComponentContext'); break
            except Exception:
                if process.poll() is not None: break
                time.sleep(0.1)
        if context is None: raise ValueError('paper_export_renderer_unavailable')
        desktop = context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
        document = desktop.loadComponentFromURL(source.resolve().as_uri(), '_blank', 0,
            (property_value('Hidden', True), property_value('ReadOnly', False), property_value('MacroExecutionMode', 4), property_value('UpdateDocMode', 0)))
        if not document: raise ValueError('paper_export_render_failed')
        count = 0
        embedded = document.getEmbeddedObjects()
        for name in embedded.getElementNames():
            if cancelled.exists(): raise ValueError('paper_export_cancelled')
            model = embedded.getByName(name).Model
            if not model.supportsService('com.sun.star.formula.FormulaProperties'):
                raise ValueError('paper_export_unsupported_markup')
            for name in ['FontNameVariables', 'FontNameFunctions', 'FontNameNumbers', 'FontNameMath']:
                model.setPropertyValue(name, 'StudyAgent Print Math')
                if model.getPropertyValue(name) != 'StudyAgent Print Math': raise ValueError('paper_export_font_invalid')
            model.setPropertyValue('FontNameText', 'StudyAgent Print Serif'); count += 1
        if cancelled.exists(): raise ValueError('paper_export_cancelled')
        options = (property_value('UseTaggedPDF', True), property_value('ExportBookmarks', True), property_value('EmbedStandardFonts', True))
        document.storeToURL(destination.resolve().as_uri(), (property_value('FilterName', 'writer_pdf_Export'), property_value('Overwrite', False),
            property_value('FilterData', uno.Any('[]com.sun.star.beans.PropertyValue', options))))
        if cancelled.exists(): raise ValueError('paper_export_cancelled')
        if sha256(source.read_bytes()).hexdigest() != expected_sha256: raise ValueError('paper_export_source_changed')
        if not destination.is_file() or not 1 <= destination.stat().st_size <= 80 * 1024 * 1024: raise ValueError('paper_export_byte_limit')
        return {'formulas': count, 'sourceUnchanged': True}
    finally:
        if document:
            try: document.close(True)
            except Exception: pass
        if desktop:
            try: desktop.terminate()
            except Exception: pass
        try: stdout, stderr = process.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill(); stdout, stderr = process.communicate(timeout=5)
        # This per-attempt private log never becomes a product response.
        with (profile.parent / (profile.name + '-process.json')).open('x', encoding='utf8') as stream:
            json.dump({'exit': process.returncode, 'stdout': stdout.decode('utf8', errors='replace')[:65536],
                       'stderr': stderr.decode('utf8', errors='replace')[:65536]}, stream)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ['source', 'source-sha256', 'destination', 'profile', 'soffice', 'cancelled']:
        parser.add_argument('--' + flag, required=True)
    args = parser.parse_args()
    try:
        value = render(args.source, args.source_sha256, args.destination, args.profile, args.soffice, args.cancelled)
        print('PAPER_EXPORT_OFFICE ' + json.dumps({'protocol': PROTOCOL, 'result': value}))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error).startswith('paper_export_') else 'paper_export_render_failed'
        print('PAPER_EXPORT_OFFICE ' + json.dumps({'protocol': PROTOCOL, 'error': code}))
        raise SystemExit(1)
