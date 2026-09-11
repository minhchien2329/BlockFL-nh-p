"""Máy chủ tĩnh cho dashboard.

Phục vụ từ thư mục gốc dự án để trang đọc được:
  /dashboard/index.html , /deployments/localhost.json , /results.json

Chạy:  python dashboard/serve.py [port]   ->  mở http://127.0.0.1:<port>/dashboard/
       (port mặc định 8000, tự đổi nếu đang bị chiếm)
"""
from __future__ import annotations

import http.server
import socketserver
import sys
import webbrowser
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):  # bớt ồn
        pass


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}/dashboard/"
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Dashboard: {url}")
        print("Ctrl+C to stop.")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()
