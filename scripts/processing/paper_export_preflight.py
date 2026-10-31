"""Read-only book preflight for an already authorized, frozen private input."""
from pathlib import Path
import argparse
import json
import re
from file_leases import no_links
from paper_export_protocol import error_code


def inspect(args):
    if not re.fullmatch('[a-f0-9]{64}', args.input_sha256): raise ValueError('paper_export_invalid_input')
    workspace = Path(args.workspace); no_links(workspace)
    if not workspace.is_dir(): raise ValueError('paper_export_invalid_input')
    from paper_export_runtime import verify_dependencies
    verify_dependencies()
    from paper_export_fonts import load_font_set
    from paper_export_content import preflight
    return preflight(args.input, args.input_sha256, workspace, load_font_set(args.font_root))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['workspace', 'input', 'input-sha256', 'font-root']: parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    try: print('PAPER_EXPORT_PREFLIGHT ' + json.dumps(inspect(args)))
    except Exception as error:
        reason = error_code(error, 'paper_export_invalid_input')
        print('PAPER_EXPORT_PREFLIGHT ' + json.dumps({'protocol': 'paper-export-preflight-v1', 'books': {
            book: {'available': False, 'reason': reason, 'items': None, 'media': None} for book in ['practice', 'answers']}}))
        raise SystemExit(1)
