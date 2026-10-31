"""Run the entire renderer tree in one kill-on-close Windows Job Object."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from file_leases import no_links, file_lease
from paper_export_process import RendererJob
from paper_export_protocol import error_code
from paper_export_runtime import minimal_environment


def run_owned(args):
    workspace = Path(args.workspace).absolute(); no_links(workspace)
    if not workspace.is_dir(): raise ValueError('paper_export_invalid_input')
    cancelled = workspace / 'cancelled'; no_links(cancelled)
    if cancelled.exists(): raise ValueError('paper_export_cancelled')
    # Poll the anonymous parent pipe without a daemon blocked inside Python's
    # buffered stdin lock during interpreter shutdown.
    import ctypes
    import msvcrt
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.PeekNamedPipe.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
    kernel.PeekNamedPipe.restype = wintypes.BOOL
    parent_pipe = msvcrt.get_osfhandle(sys.stdin.fileno())
    def parent_closed(): return not kernel.PeekNamedPipe(parent_pipe, None, 0, None, None, None)
    command = [sys.executable, '-E', '-s', '-B', '-X', 'utf8', str(Path(__file__).with_name('paper_export_document.py'))]
    for name in ['workspace', 'input', 'input_sha256', 'font_root', 'uno_python', 'soffice', 'book']:
        command += ['--' + name.replace('_', '-'), getattr(args, name)]
    log = workspace / ('supervisor-' + args.book + '.log'); no_links(log)
    job = RendererJob(); process = None
    try:
        with log.open('xb') as stream:
            process = job.start(command, cwd=workspace, env=minimal_environment(), stdin=subprocess.DEVNULL, stdout=stream, stderr=stream)
            deadline = time.monotonic() + 220
            while process.poll() is None:
                if parent_closed() or cancelled.exists(): job.terminate(); process.wait(timeout=10); raise ValueError('paper_export_cancelled')
                if time.monotonic() >= deadline: job.terminate(); process.wait(timeout=10); raise ValueError('paper_export_render_timeout')
                time.sleep(0.1)
        no_links(log)
        with log.open('rb') as stream:
            stream.seek(max(0, log.stat().st_size - 2 * 1024 * 1024)); text = stream.read().decode('utf8', errors='replace')
        reports = [line for line in text.splitlines() if line.startswith('PAPER_EXPORT_RESULT ')]
        if len(reports) != 1: raise ValueError('paper_export_render_failed')
        result = json.loads(reports[0][len('PAPER_EXPORT_RESULT '):])
        if process.returncode != 0:
            raise ValueError(result.get('error', 'paper_export_render_failed'))
        return result
    finally:
        if process is not None and process.poll() is None:
            job.terminate(); process.wait(timeout=10)
        cleanup = job.close()
        with (workspace / ('supervisor-' + args.book + '-process.json')).open('x', encoding='utf8') as stream:
            json.dump({'protocol': 'paper-export-supervisor-v1', 'pid': os.getpid(), 'childPid': None if process is None else process.pid,
                       'tree': cleanup, 'parentPipeClosed': parent_closed()}, stream)


def supervise(args):
    import re
    workspace = Path(args.workspace).absolute()
    if workspace.parent.name != 'paper-exports' or not re.fullmatch('[a-f0-9]{64}', workspace.name):
        raise ValueError('paper_export_invalid_input')
    control = workspace.parent / 'control' / workspace.name
    # The actual Python owner survives a Node failure. Late acquisition after
    # collection sees the durable revocation before it can write anything.
    with file_lease(control):
        no_links(workspace)
        if not workspace.is_dir(): raise ValueError('paper_export_cancelled')
        return run_owned(args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['workspace', 'input', 'input-sha256', 'font-root', 'uno-python', 'soffice', 'book']: parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    if args.book not in {'practice', 'answers'}: parser.error('Unsupported book')
    try: print('PAPER_EXPORT_RESULT ' + json.dumps(supervise(args), ensure_ascii=True))
    except Exception as error:
        print('PAPER_EXPORT_RESULT ' + json.dumps({'protocol': 'paper-export-render-result-v1', 'error': error_code(error)}))
        raise SystemExit(1)
