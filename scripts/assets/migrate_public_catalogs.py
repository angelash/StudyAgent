"""Preserve explicitly indexed public JSON bodies, including extensionless captures.

Only successful static cbern catalogue responses already recorded by the survey are
eligible. Request headers, arbitrary HTTP captures and account material are excluded.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit


def run(source: Path, target: Path, migration=None):
    if migration is None:
        from migrate_assets import Migration
        migration = Migration(source, target)
    survey = source / 'education-app-survey'
    catalogues = survey / 'local/round2'
    records = []
    for name in ['smartedu-catalogs.json', 'smartedu-indexes.json', 'textbook-parts.json', 'textbook-detail-probe.json']:
        value = json.loads((catalogues / name).read_text('utf-8'))
        def visit(node):
            if isinstance(node, dict):
                if {'url', 'status', 'path', 'sha256', 'content_type'} <= node.keys():
                    host = urlsplit(node['url']).hostname or ''
                    if node['status'] == 200 and host.endswith('.cbern.com.cn') and 'json' in node['content_type']:
                        records.append(node)
                for child in node.values():
                    visit(child)
            elif isinstance(node, list):
                for child in node:
                    visit(child)
        visit(value)
    copied = []
    for record in {r['sha256']: r for r in records}.values():
        path = (survey / record['path']).resolve()
        if survey.resolve() not in path.parents:
            raise ValueError('Catalogue source path escaped survey')
        json.loads(path.read_text('utf-8'))
        relative = f"research/education-app-survey/public-catalogs/{record['sha256']}.json"
        migration.copy(path, relative, record['sha256'])
        copied.append({'path': relative, 'url': record['url'], 'sha256': record['sha256'], 'bytes': record['bytes']})
    migration.manifest.commit()
    summary = {'catalogues': copied, 'count': len(copied), 'bytes': sum(r['bytes'] for r in copied)}
    (target / 'public-catalogues.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'count': summary['count'], 'bytes': summary['bytes']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--target', type=Path, default=Path('data/assets'))
    args = parser.parse_args()
    run(args.source, args.target)
