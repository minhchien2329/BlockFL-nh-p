"""Máy chủ tĩnh cho dashboard + điều khiển chạy demo trực tiếp.

Phục vụ từ thư mục gốc dự án để trang đọc được:
  /dashboard/index.html , /deployments/localhost.json , /results.json

Ngoài file tĩnh còn có 2 endpoint cục bộ để nút "Chạy demo trực tiếp" trên
trang Tổng quan dùng:
  POST /api/demo/start    -> reset chain + deploy + chạy run_demo.py (nền)
  GET  /api/demo/status   -> pha hiện tại + vài dòng log cuối

Chạy:  python dashboard/serve.py [port]   ->  mở http://127.0.0.1:<port>/dashboard/
       (port mặc định 8000)
"""
from __future__ import annotations

import http.server
import json
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
RPC_URL = "http://127.0.0.1:8545"
MAX_LOG_LINES = 400


class DemoRunner:
    """Chạy trọn kịch bản demo trong một luồng nền, ghi log để trang đọc lại.

    Ba pha, đúng thứ tự một người sẽ gõ tay:
      reset  -> xoá sạch chain local (hardhat_reset)
      deploy -> npx hardhat run scripts/deploy.js
      train  -> python run_demo.py

    Cố ý reset trước: mỗi lần bấm là một lượt demo sạch từ số 0, nên bảng round
    và nhật ký sự kiện lấp đầy ngay trước mắt người xem thay vì nối tiếp một
    lượt chạy cũ.
    """

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        self.phase = "idle"          # idle | reset | deploy | train | done | error
        self.log: list[str] = []
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self.error: str | None = None

    # ------------------------------------------------------------- helpers
    def _say(self, line: str) -> None:
        with self.lock:
            self.log.append(line)
            del self.log[:-MAX_LOG_LINES]

    def _stream(self, cmd: list[str], cwd: Path) -> int:
        self._say(f"$ {' '.join(cmd)}")
        proc = subprocess.Popen(
            cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        for line in proc.stdout:                      # type: ignore[union-attr]
            line = line.rstrip()
            if line:
                self._say(line)
        return proc.wait()

    # ---------------------------------------------------------------- pha
    def _reset_chain(self) -> None:
        body = json.dumps({"jsonrpc": "2.0", "method": "hardhat_reset",
                           "params": [], "id": 1}).encode()
        req = urllib.request.Request(RPC_URL, data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())
        if not res.get("result"):
            raise RuntimeError(f"hardhat_reset không thành công: {res}")
        self._say("Đã xoá sạch chain local — bắt đầu lại từ block 0")

    def _run(self, rounds: int, seed: int) -> None:
        try:
            self.phase = "reset"
            self._say("=== 1/3 · Reset chain local ===")
            self._reset_chain()

            self.phase = "deploy"
            self._say("")
            self._say("=== 2/3 · Deploy 2 smart contract + đăng ký node ===")
            npx = "npx.cmd" if sys.platform == "win32" else "npx"
            code = self._stream([npx, "hardhat", "run", "scripts/deploy.js",
                                 "--network", "localhost"], ROOT)
            if code != 0:
                raise RuntimeError(f"deploy thất bại (mã {code})")

            self.phase = "train"
            self._say("")
            self._say(f"=== 3/3 · Chạy {rounds} round Federated Learning (seed {seed}) ===")
            code = self._stream([sys.executable, "run_demo.py",
                                 "--rounds", str(rounds), "--seed", str(seed)], ROOT)
            if code != 0:
                raise RuntimeError(f"run_demo.py thất bại (mã {code})")

            self.phase = "done"
            self._say("")
            self._say("=== Xong. Dashboard sẽ tự cập nhật trong 5 giây tới. ===")
        except Exception as exc:                      # noqa: BLE001 — báo nguyên văn ra UI
            self.phase = "error"
            self.error = str(exc)
            self._say(f"LỖI: {exc}")
        finally:
            self.finished_at = time.time()

    # -------------------------------------------------------------- public
    def start(self, rounds: int, seed: int) -> tuple[bool, str]:
        if self.phase in ("reset", "deploy", "train"):
            return False, "Một lượt chạy đang diễn ra."
        self.reset()
        self.started_at = time.time()
        threading.Thread(target=self._run, args=(rounds, seed), daemon=True).start()
        return True, "Đã bắt đầu."

    def status(self) -> dict:
        with self.lock:
            log = list(self.log)
        elapsed = None
        if self.started_at:
            elapsed = round((self.finished_at or time.time()) - self.started_at, 1)
        return {"phase": self.phase, "error": self.error,
                "elapsed": elapsed, "log": log[-40:]}


RUNNER = DemoRunner()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    # Các endpoint dưới đây chạy lệnh trên máy, nên chỉ nhận kết nối loopback.
    def _local_only(self) -> bool:
        if self.client_address[0] in ("127.0.0.1", "::1"):
            return True
        self._json({"ok": False, "error": "chỉ cho phép từ máy cục bộ"}, 403)
        return False

    def _json(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/demo/status"):
            if self._local_only():
                self._json(RUNNER.status())
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/demo/start"):
            if not self._local_only():
                return
            n = int(self.headers.get("Content-Length") or 0)
            try:
                req = json.loads(self.rfile.read(n) or b"{}")
            except json.JSONDecodeError:
                req = {}
            rounds = max(1, min(20, int(req.get("rounds", 5))))
            seed = int(req.get("seed", 7))
            ok, msg = RUNNER.start(rounds, seed)
            self._json({"ok": ok, "message": msg}, 200 if ok else 409)
            return
        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):  # bớt ồn
        pass


class Server(socketserver.ThreadingTCPServer):
    """Threading: một lượt demo chạy vài chục giây, không được chặn trang."""
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}/dashboard/"
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Dashboard: {url}")
        print("Ctrl+C to stop.")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()
