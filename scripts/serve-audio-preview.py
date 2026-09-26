#!/usr/bin/env python3
"""Local-only preview: gzip the unchanged manifest as GitHub Pages does."""
import argparse
import gzip
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def accepts_gzip(value):
    for part in value.lower().split(','):
        fields = [field.strip() for field in part.split(';')]
        if fields[0] != 'gzip':
            continue
        quality = 1.0
        for field in fields[1:]:
            if field.startswith('q='):
                try:
                    quality = float(field[2:])
                except ValueError:
                    quality = 0
        return quality > 0
    return False


def make_handler(root):
    payload = gzip.compress((root / 'audio/audio-manifest.json').read_bytes(), compresslevel=6, mtime=0)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def send_head(self):
            if (urlsplit(self.path).path == '/audio/audio-manifest.json'
                    and accepts_gzip(self.headers.get('Accept-Encoding', ''))):
                from io import BytesIO
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Vary', 'Accept-Encoding')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                return BytesIO(payload)
            return super().send_head()
    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--port', type=int, default=8798)
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    server = ThreadingHTTPServer(('0.0.0.0', args.port), make_handler(root))
    print('Audio preview ready on port %s' % args.port, flush=True)
    server.serve_forever()
