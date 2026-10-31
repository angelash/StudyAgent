from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).absolute().parent.parent/'p166/scripts/processing'))
"""Local per-document Office rendering. Invoked with the configured UNO runtime."""
from pathlib import Path
from hashlib import sha256
import argparse, json, os, subprocess, sys, time, uuid, threading
import uno
from com.sun.star.beans import PropertyValue
from file_leases import no_links
from paper_export_process import RendererJob
from paper_export_protocol import error_code
from paper_export_runtime import loaded_office_version

PROTOCOL = 'paper-export-office-v1'


def property_value(name, value):
    item = PropertyValue(); item.Name = name; item.Value = value; return item


def render(source, expected_sha256, destination, profile, executable, cancelled):
    source, destination, profile, cancelled = map(Path, [source, destination, profile, cancelled])
    for path in [source, destination, profile, cancelled, Path(executable)]: no_links(path)
    if source.absolute().parent != destination.absolute().parent or profile.absolute().parent != destination.absolute().parent:
        raise ValueError('paper_export_invalid_input')
    if not source.is_file() or sha256(source.read_bytes()).hexdigest() != expected_sha256 or destination.exists() or profile.exists():
        raise ValueError('paper_export_source_changed')
    if cancelled.exists(): raise ValueError('paper_export_cancelled')
    profile.mkdir(parents=True, exist_ok=False)
    pipe = 'study_paper_' + uuid.uuid4().hex
    arguments = [str(executable), '-env:UserInstallation=' + profile.resolve().as_uri(), '--headless', '--invisible', '--norestore',
                 '--nodefault', '--nofirststartwizard', '--accept=pipe,name=' + pipe + ';urp;StarOffice.ComponentContext']
    job = RendererJob()
    stdout_file = (profile.parent / (profile.name + '-stdout.log')).open('xb')
    stderr_file = (profile.parent / (profile.name + '-stderr.log')).open('xb')
    process = job.start(arguments, stdin=subprocess.DEVNULL, stdout=stdout_file, stderr=stderr_file)
    with (profile.parent / (profile.name + '-started.json')).open('x', encoding='utf8') as stream:
        json.dump({'rootPid': process.pid, 'job': job.accounting(), 'assignedBeforeResume': True}, stream)
    done = threading.Event(); interrupted = []
    def watch():
        deadline = time.monotonic() + 160
        while not done.wait(0.1):
            reason = 'paper_export_cancelled' if cancelled.exists() else 'paper_export_render_timeout' if time.monotonic() >= deadline else None
            if any(path.stat().st_size > 1024 * 1024 for path in [Path(stdout_file.name), Path(stderr_file.name)]): reason = 'paper_export_byte_limit'
            if reason:
                interrupted.append(reason)
                job.terminate()
                return
    watcher = threading.Thread(target=watch, daemon=True); watcher.start()
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
        if context is None: raise ValueError(interrupted[0] if interrupted else 'paper_export_renderer_unavailable')
        office_version = loaded_office_version(context)
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
        document.getTextFields().refresh()
        if cancelled.exists(): raise ValueError('paper_export_cancelled')
        options = (property_value('UseTaggedPDF', True), property_value('ExportBookmarks', True), property_value('ExportBookmarksToPDFDestination', True), property_value('EmbedStandardFonts', True))
        document.storeToURL(destination.resolve().as_uri(), (property_value('FilterName', 'writer_pdf_Export'), property_value('Overwrite', False),
            property_value('FilterData', uno.Any('[]com.sun.star.beans.PropertyValue', options))))
        if cancelled.exists(): raise ValueError('paper_export_cancelled')
        if sha256(source.read_bytes()).hexdigest() != expected_sha256: raise ValueError('paper_export_source_changed')
        if not destination.is_file() or not 1 <= destination.stat().st_size <= 80 * 1024 * 1024: raise ValueError('paper_export_byte_limit')
        if interrupted: raise ValueError(interrupted[0])
        return {'formulas': count, 'sourceUnchanged': True, 'officeVersion': office_version}
    finally:
        if document and not interrupted:
            try: document.close(True)
            except Exception: pass
        if desktop and not interrupted:
            try: desktop.terminate()
            except Exception: pass
        try: process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            job.terminate(); process.wait(timeout=5)
        done.set(); watcher.join(timeout=1)
        cleanup = job.close()
        stdout_file.close(); stderr_file.close()
        # This per-attempt private log never becomes a product response.
        with (profile.parent / (profile.name + '-process.json')).open('x', encoding='utf8') as stream:
            json.dump({'exit': process.returncode, 'processTree': cleanup, 'interrupted': interrupted,
                       'stdout': Path(stdout_file.name).read_text(encoding='utf8', errors='replace')[:65536],
                       'stderr': Path(stderr_file.name).read_text(encoding='utf8', errors='replace')[:65536]}, stream)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ['source', 'source-sha256', 'destination', 'profile', 'soffice', 'cancelled']:
        parser.add_argument('--' + flag, required=True)
    args = parser.parse_args()
    try:
        value = render(args.source, args.source_sha256, args.destination, args.profile, args.soffice, args.cancelled)
        print('PAPER_EXPORT_OFFICE ' + json.dumps({'protocol': PROTOCOL, 'result': value}))
    except Exception as error:
        code = error_code(error)
        print('PAPER_EXPORT_OFFICE ' + json.dumps({'protocol': PROTOCOL, 'error': code}))
        raise SystemExit(1)
