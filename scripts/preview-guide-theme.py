#!/usr/bin/env python3
"""Preview this checkout only. Never deploys or changes stored production settings."""
import argparse
import functools
import http.server
import pathlib
import socket
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8841)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
# Injection exists only in the preview response, never in the tracked HTML.
# It permits phone LAN testing without touching production login/theme storage.
bootstrap = b'''<script>(function(){var t=new URLSearchParams(location.search).get('previewTheme');if(t==='dark'||t==='light'){try{localStorage.setItem('gomna_theme_v1',t)}catch(e){}}})();</script>'''
class Preview(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        route = urlsplit(self.path).path
        if route in ('/', '/index.html', '/reader.html', '/meditation.html'):
            file = root / (route.lstrip('/') or 'index.html')
            data = file.read_bytes().replace(b'<head>', b'<head>'+bootstrap, 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers(); self.wfile.write(data)
        else:
            super().do_GET()
handler = functools.partial(Preview, directory=str(root))
server = http.server.ThreadingHTTPServer(('0.0.0.0', args.port), handler)
print('시험본 경로:', root, flush=True)
print(f'Mac 인물: http://localhost:{args.port}/?previewTheme=dark#bible-library/people', flush=True)
print(f'Mac 이야기: http://localhost:{args.port}/?previewTheme=dark#bible-library/stories', flush=True)
print(f'Mac 묵상: http://localhost:{args.port}/meditation.html?previewTheme=dark', flush=True)
print(f'Mac 길잡이: http://localhost:{args.port}/reader.html?homeGuide=1&previewTheme=dark', flush=True)
try:
    import subprocess
    ip = subprocess.check_output(['ipconfig', 'getifaddr', 'en0'], text=True).strip()
    if ip:
        print(f'iPhone 인물: http://{ip}:{args.port}/?previewTheme=dark#bible-library/people', flush=True)
        print(f'iPhone 이야기: http://{ip}:{args.port}/?previewTheme=dark#bible-library/stories', flush=True)
        print(f'iPhone 묵상: http://{ip}:{args.port}/meditation.html?previewTheme=dark', flush=True)
except (OSError, subprocess.SubprocessError):
    print('iPhone: Mac의 Wi-Fi IP 주소와 위 포트를 사용하세요.', flush=True)
print('라이트 모드: previewTheme=light / 종료: Ctrl+C', flush=True)
print('HTTP LAN 검사는 Safari용입니다. 설치형 PWA 검증에는 별도 HTTPS 시험 주소가 필요합니다.', flush=True)
server.serve_forever()
