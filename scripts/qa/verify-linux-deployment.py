"""Exercise an isolated PostgreSQL/API/worker/Web/nginx HTTPS deployment on Linux.

Uses only newly created directories and owned processes; never installs services,
changes the host trust store, publishes recovered content or uses real accounts.
Run with the project's native Python virtual environment after verify-linux-release.
"""
import argparse
from contextlib import ExitStack
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def main(args):
    if sys.platform != 'linux':
        raise ValueError('Linux is required')
    directory = args.directory.absolute()
    directory.mkdir(parents=True, exist_ok=False)
    directory.chmod(0o700)
    application = args.application.resolve()
    node = args.node.absolute()
    logs = directory / 'logs'
    logs.mkdir()
    pg_data = directory / 'postgres'
    api_port, web_port, tls_port, redirect_port, pg_port = [free_port() for _ in range(5)]
    if len({api_port, web_port, tls_port, redirect_port, pg_port}) != 5:
        raise ValueError('Port allocation collision; use a new QA directory')
    origin = f'https://127.0.0.1:{tls_port}'
    evidence = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'passed': False,
                'scope': 'Owned local Ubuntu PostgreSQL, separate API/worker and Next production processes behind nginx TLS. Synthetic accounts, real migrated assets. HTTP only; no browser or installed-systemd acceptance.',
                'checks': [], 'directory': str(directory), 'application': str(application), 'origin': origin}
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    children = []
    pg_started = False
    stack = ExitStack()
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(('STUDY_', 'OPENAI_', 'NEXT_PUBLIC_', 'AI_'))
           and key not in {'NODE_OPTIONS', 'DATABASE_URL', 'API_PORT', 'API_HOST', 'CORS_ORIGINS'}}
    password = secrets.token_hex(24)
    database_url = f'postgresql://study_app:{password}@127.0.0.1:{pg_port}/study_deployment'
    env.update({'NODE_ENV': 'production', 'PATH': str(node.parent) + ':' + os.defpath,
                'API_HOST': '127.0.0.1', 'API_PORT': str(api_port), 'CORS_ORIGINS': origin,
                'STUDY_STORAGE': 'postgres', 'DATABASE_URL': database_url,
                'STUDY_DATA_DIR': str(directory / 'business-files'), 'STUDY_ASSET_ROOT': str(args.assets.resolve()),
                'STUDY_PYTHON': sys.executable, 'STUDY_FFMPEG': str(args.ffmpeg.absolute()), 'STUDY_FFPROBE': str(args.ffprobe.absolute()),
                'STUDY_WORKER_ENABLED': 'false', 'STUDY_TRUST_PROXY': '127.0.0.1/32',
                'OPENAI_API_KEY': '', 'NEXT_PUBLIC_API_BASE_URL': '', 'NEXT_TELEMETRY_DISABLED': '1'})

    def save():
        args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    def checked(name, details=None):
        evidence['checks'].append({'name': name, 'passed': True, **(details or {})})
        save()
        print('Linux deployment: ' + name, flush=True)

    def run(name, command, *, input=None, extra_env=None, timeout=60):
        with (logs / (name + '.log')).open('ab') as output:
            result = subprocess.run(command, cwd=application, env={**env, **(extra_env or {})}, input=input,
                                    stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
        if result.returncode:
            raise RuntimeError(name + ' failed; see its local log')

    def start(name, command, extra_env=None):
        output = stack.enter_context((logs / (name + '.log')).open('ab'))
        process = subprocess.Popen(command, cwd=application, env={**env, **(extra_env or {})},
                                   stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        children.append(process)
        return process

    def stop(process):
        if process.poll() is None:
            if os.getpgid(process.pid) != process.pid:
                raise RuntimeError('Unexpected process group')
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)

    def ready(url, process, opener=urllib.request):
        deadline = time.monotonic() + 60
        while True:
            if process.poll() is not None:
                raise RuntimeError('Owned service stopped before readiness')
            try:
                with opener.urlopen(url, timeout=2) if opener is urllib.request else opener.open(url, timeout=2) as response:
                    if response.status == 200:
                        return
            except OSError:
                if time.monotonic() > deadline:
                    raise RuntimeError('Owned service readiness timed out')
                time.sleep(.2)

    try:
        # Private cluster, independent of any installed PostgreSQL service.
        pwfile = directory / 'pg-password'
        pwfile.write_text(password + '\n'); pwfile.chmod(0o600)
        run('pg_init', [str(args.pg_bin / 'initdb'), '-D', str(pg_data), '-U', 'qa_admin', '--encoding=UTF8', '--locale=C.UTF-8',
                        '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', '--pwfile=' + str(pwfile)])
        run('pg_start', [str(args.pg_bin / 'pg_ctl'), '-D', str(pg_data), '-w', '-t', '45', '-l', str(logs / 'postgres.log'),
                         '-o', f'-h 127.0.0.1 -p {pg_port} -k {directory}', 'start'])
        pg_started = True
        sql = f"CREATE ROLE study_app LOGIN PASSWORD '{password}';\nCREATE DATABASE study_deployment OWNER study_app;\n".encode()
        run('pg_app_role', [str(args.pg_bin / 'psql'), '-h', '127.0.0.1', '-p', str(pg_port), '-U', 'qa_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
            input=sql, extra_env={'PGPASSWORD': password})
        pwfile.unlink()
        checked('isolated_postgres_application_role')
        run('bootstrap_admin', [str(node), 'apps/api/dist/apps/api/src/cli.js', 'create-admin', 'qa-linux-deployment'], extra_env={'STUDY_ADMIN_PASSWORD': password})
        api = start('api', [str(node), 'apps/api/dist/apps/api/src/main.js'])
        ready(f'http://127.0.0.1:{api_port}/api/ready', api)
        web = start('web', [str(node), 'scripts/run-web.cjs', 'start', '-p', str(web_port), '-H', '127.0.0.1'])
        ready(f'http://127.0.0.1:{web_port}/parent/login', web)

        cert, key = directory / 'certificate.pem', directory / 'private-key.pem'
        run('qa_certificate', ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
                               '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-keyout', str(key), '-out', str(cert)])
        key.chmod(0o600)
        source_config = args.nginx_config.read_text(encoding='utf-8')
        config = source_config.replace('listen 80;', f'listen 127.0.0.1:{redirect_port};').replace('listen 443 ssl http2;', f'listen 127.0.0.1:{tls_port} ssl http2;')
        config = config.replace('server_name study.example.com;', 'server_name localhost 127.0.0.1;')
        config = config.replace('https://study.example.com', origin)
        config = config.replace('/etc/letsencrypt/live/study.example.com/fullchain.pem', str(cert))
        config = config.replace('/etc/letsencrypt/live/study.example.com/privkey.pem', str(key))
        config = config.replace('127.0.0.1:4000', f'127.0.0.1:{api_port}').replace('127.0.0.1:3000', f'127.0.0.1:{web_port}')
        temporary_paths = ' '.join(name + ' ' + str(directory / name) + ';' for name in ['client_body_temp_path', 'proxy_temp_path', 'fastcgi_temp_path', 'uwsgi_temp_path', 'scgi_temp_path'])
        wrapped = f'worker_processes 1;\npid {directory}/nginx.pid;\nerror_log {logs}/nginx-error.log;\nevents {{ worker_connections 128; }}\nhttp {{ access_log off; {temporary_paths}\n{config}\n}}\n'
        configuration = directory / 'nginx.conf'; configuration.write_text(wrapped)
        run('nginx_config', [str(args.nginx), '-t', '-c', str(configuration), '-p', str(directory)])
        proxy = start('nginx', [str(args.nginx), '-c', str(configuration), '-p', str(directory), '-g', 'daemon off;'])
        context = ssl.create_default_context(cafile=str(cert))

        def browser_http():
            jar = http.cookiejar.CookieJar()
            return urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(jar))

        admin, parent, other = browser_http(), browser_http(), browser_http()
        ready(origin + '/api/ready', proxy, admin)

        def request(client, method, route, body=None, status=200, headers=None):
            encoded = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
            request_headers = {'Origin': origin, **({'Content-Type': 'application/octet-stream' if isinstance(body, bytes) else 'application/json'} if encoded is not None else {}), **(headers or {})}
            query = urllib.request.Request(origin + route, data=encoded, headers=request_headers, method=method)
            try:
                response = client.open(query, timeout=60)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                content = response.read()
                if response.status != status:
                    raise RuntimeError(f'{method} {route}: expected {status}, got {response.status}')
                return content, dict(response.headers)

        def call(client, method, route, body=None, status=None):
            content, _ = request(client, method, '/api' + route, body, status or (201 if method == 'POST' else 200))
            payload = json.loads(content)
            if status is None or status < 400:
                if payload.get('error') is not None:
                    raise RuntimeError('API envelope contains an error')
            return payload.get('data')

        _, headers = request(admin, 'POST', '/api/auth/login', {'principal': 'qa-linux-deployment', 'credential': password}, 201)
        cookie = next(value for name, value in headers.items() if name.lower() == 'set-cookie').lower()
        if not all(part in cookie for part in ['httponly', 'secure', 'samesite=strict', 'path=/api']):
            raise RuntimeError('Production cookie attributes missing')
        assert call(admin, 'GET', '/auth/me')['role'] == 'admin'
        _, security_headers = request(admin, 'GET', '/parent/login')
        assert 'strict-transport-security' in {name.lower() for name in security_headers}
        checked('same_origin_tls_secure_cookie_and_protected_login', {'nginxConfigSha256': hashlib.sha256(source_config.encode()).hexdigest()})
        for client, name in [(parent, 'parent'), (other, 'other')]:
            call(client, 'POST', '/auth/register', {'principal': 'qa-linux-' + name, 'credential': password})
        student = call(parent, 'POST', '/students', {'nickname': 'Linux合成学习样本', 'grade': 3, 'preferredSessionMinutes': 15,
                                                     'defaultVersionMap': {'math': 'original', 'chinese': '', 'english': ''}})['profile']['id']
        atom = 'foundation:math:multiplydigits'
        call(parent, 'PUT', f'/students/{student}/learning-scope', {'subject': 'math', 'grade': 3, 'term': 'upper', 'textbookVolumeId': None,
            'textbookVersion': '原创能力路径', 'learnedAtomIds': [atom], 'currentAtomId': atom, 'minutesPerSession': 15})
        session = call(parent, 'POST', '/diagnostics/sessions', {'studentId': student, 'subject': 'math', 'maxItems': 4})
        for item in session['items']:
            call(parent, 'POST', f'/diagnostics/sessions/{session["id"]}/responses', {'itemId': item['id'], 'answer': 0, 'elapsedMs': 1234})
        report = call(parent, 'POST', f'/diagnostics/sessions/{session["id"]}/complete', {})
        assert report['rawScore'] == 0 and all(item['status'] != 'secure' for item in report['estimates'])
        call(other, 'GET', f'/diagnostics/sessions/{session["id"]}', status=403)
        plan = call(parent, 'POST', f'/diagnostics/students/{student}/plans', {'baselineSessionId': session['id'], 'minutesPerDay': 15, 'useAi': False})
        call(parent, 'PATCH', f'/diagnostics/plans/{plan["id"]}', {'status': 'active', 'expectedRevision': plan['revision']})
        practice = call(parent, 'POST', f'/learning/plans/{plan["id"]}/actions/{plan["actions"][0]["id"]}/start', {})
        call(parent, 'PATCH', f'/learning/practice/{practice["id"]}/questions/{practice["questions"][0]["id"]}/draft', {'answer': 0})
        checked('postgres_learning_scope_assessment_report_plan_training_and_isolation')

        # Real archived PDF plus its rasterized page exercise text and OCR branches.
        import fitz
        source = args.assets / 'shijuanbao/media/0004aeabe1a3f4914e71f28b70890a7d927f12a76c22b7984ee1018364c82ba0.pdf'
        with fitz.open(source) as original, fitz.open() as document:
            assert len(original[0].get_text().strip()) > 100
            document.insert_pdf(original, from_page=0, to_page=0)
            image = original[0].get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
            page = document.new_page(width=original[0].rect.width, height=original[0].rect.height)
            page.insert_image(page.rect, stream=image.tobytes('png'))
            document.embfile_add('qa-size-probe.bin', os.urandom(4 * 1024 * 1024 + 100000))
            pdf = document.tobytes(garbage=4, deflate=True)
        file = call(admin, 'POST', '/admin/import-files', {'name': 'local-qa-native-scanned.pdf', 'size': len(pdf), 'mediaType': 'application/pdf', 'requestKey': 'linux-proxy-import'})
        for index, offset in enumerate(range(0, len(pdf), file['chunkSize'])):
            request(admin, 'PUT', f'/api/admin/import-files/{file["id"]}/chunks/{index}', pdf[offset:offset + file['chunkSize']])
        completed = call(admin, 'POST', f'/admin/import-files/{file["id"]}/complete', {})
        assert completed['sha256'] == hashlib.sha256(pdf).hexdigest()
        prefix, range_headers = request(admin, 'GET', f'/api/admin/import-files/{file["id"]}/content', status=206, headers={'Range': 'bytes=0-4'})
        assert prefix == b'%PDF-' and any(name.lower() == 'content-range' for name in range_headers)
        job = call(admin, 'POST', '/admin/question-import-jobs', {'importType': 'textbook_pdf', 'subject': 'math', 'fileIds': [file['id']],
            'requestKey': 'linux-proxy-persistent-job', 'sourcePolicy': {'sourceType': 'public_reference', 'licenseClass': 'C_PUBLIC_REFERENCE_ONLY', 'licenseName': None}})
        assert call(admin, 'GET', '/admin/processing/tasks/' + job['taskId'])['state'] == 'queued'
        checked('nginx_four_mebibyte_upload_ranges_and_durable_queue', {'uploadBytes': len(pdf), 'chunkBytes': file['chunkSize']})
        stop(api)
        api = start('api', [str(node), 'apps/api/dist/apps/api/src/main.js'])
        ready(f'http://127.0.0.1:{api_port}/api/ready', api)
        assert call(admin, 'GET', '/auth/me')['role'] == 'admin'
        restored_draft = call(parent, 'GET', f'/learning/practice/{practice["id"]}/questions/{practice["questions"][0]["id"]}')['draft']
        assert restored_draft['answer'] == 0
        assert call(admin, 'GET', '/admin/processing/tasks/' + job['taskId'])['state'] == 'queued'
        worker = start('worker', [str(node), 'apps/api/dist/apps/api/src/worker.js'], {'STUDY_WORKER_ENABLED': 'true'})
        deadline = time.monotonic() + 180
        while True:
            task = call(admin, 'GET', '/admin/processing/tasks/' + job['taskId'])
            if task['state'] == 'succeeded':
                break
            if task['state'] in {'failed', 'cancelled'} or time.monotonic() > deadline or worker.poll() is not None:
                raise RuntimeError('Independent import worker did not complete: ' + task['state'] + '/' + str(task.get('errorCode')))
            time.sleep(.5)
        assert task['result']['pages'] == 2
        candidates = call(admin, 'GET', f'/admin/question-import-jobs/{job["id"]}/candidates')
        assert candidates['total'] > 0
        checked('api_restart_cookie_draft_queue_recovery_and_separate_native_ocr_worker', {'pages': task['result']['pages'], 'candidates': candidates['total']})
        overview = call(admin, 'GET', '/library/overview')
        assert overview['ready'] and overview['researchAccess']
        papers = call(admin, 'GET', '/library/papers?collection=research&pageSize=2')
        assert len(papers['items']) == 2
        call(parent, 'GET', '/library/papers?collection=research', status=403)
        checked('migrated_paper_catalogue_and_research_access_boundary')
        run('proxy_web_assets', [str(node), 'scripts/qa/verify-web-delivery.cjs', origin, str(directory / 'web-proxy-runtime.json')], extra_env={'NODE_EXTRA_CA_CERTS': str(cert)})
        checked('production_web_scripts_stylesheets_and_fonts_through_tls_proxy')
        run('postgres_version', [str(args.pg_bin / 'postgres'), '--version'])
        run('nginx_version', [str(args.nginx), '-v'])
        evidence['passed'] = True
        evidence['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    except Exception as error:
        evidence['error'] = str(error)
        raise
    finally:
        cleanup_errors = []
        for process in reversed(children):
            try:
                stop(process)
            except Exception as error:
                cleanup_errors.append(type(error).__name__ + ': owned process cleanup failed')
        if pg_started:
            try:
                run('pg_stop', [str(args.pg_bin / 'pg_ctl'), '-D', str(pg_data), '-m', 'fast', '-w', '-t', '30', 'stop'])
            except Exception:
                cleanup_errors.append('Owned PostgreSQL cluster cleanup failed')
        stack.close()
        evidence['ownedProcessesStopped'] = not cleanup_errors
        if cleanup_errors:
            evidence['cleanupErrors'] = cleanup_errors
            evidence['passed'] = False
        save()
        if cleanup_errors:
            raise RuntimeError('; '.join(cleanup_errors))
    print(json.dumps({'passed': evidence['passed'], 'checks': len(evidence['checks'])}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['application', 'directory', 'node', 'nginx', 'nginx-config', 'pg-bin', 'assets', 'ffmpeg', 'ffprobe', 'evidence']:
        parser.add_argument('--' + name, type=Path, required=True)
    main(parser.parse_args())
