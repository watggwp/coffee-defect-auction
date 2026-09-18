"""
start_all.py - เปิดทั้งระบบด้วยคำสั่งเดียว: backend + หน้าเว็บ + ตัวตรวจ แล้วเปิด browser ให้
กด Ctrl+C ครั้งเดียวปิดทุกอย่าง

    python start_all.py               # backend + หน้าเว็บ (build แล้ว) + ตัวตรวจกล้อง
    python start_all.py --sim 5       # ใช้ตัวจำลองยิงผลตรวจทุก 5 วิ แทนกล้อง (ทดสอบ)
    python start_all.py --no-detect   # เฉพาะ backend + หน้าเว็บ
    python start_all.py --dev         # เปิด vite dev server ด้วย (แก้หน้าเว็บแล้วเห็นผลทันที ที่ :5173)
    python start_all.py --build       # บังคับ build หน้าเว็บใหม่ก่อนเริ่ม
    python start_all.py --no-browser  # ไม่เปิด browser อัตโนมัติ
"""
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WIN = os.name == "nt"

COLORS = {"backend": "\033[36m", "vite": "\033[35m", "detect": "\033[33m", "sim": "\033[32m", "start": "\033[1m"}
RESET = "\033[0m"
procs: list[tuple[str, subprocess.Popen]] = []


def log(tag: str, msg: str):
    print(f"{COLORS.get(tag, '')}[{tag:7s}]{RESET} {msg}", flush=True)


def npm() -> str:
    exe = shutil.which("npm.cmd" if IS_WIN else "npm") or shutil.which("npm")
    if not exe:
        sys.exit("[start  ] ไม่พบ npm กรุณาติดตั้ง Node.js ก่อน https://nodejs.org")
    return exe


def spawn(tag: str, cmd: list[str], cwd: Path) -> subprocess.Popen:
    """รันโปรเซสลูก แล้วส่ง stdout/stderr ออกมาพร้อม prefix [tag]"""
    log("start", f"{tag}: {' '.join(cmd)}  (cwd={cwd.name})")
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if IS_WIN else 0
    p = subprocess.Popen(
        cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1, creationflags=flags,
    )
    procs.append((tag, p))

    def pump():
        for line in p.stdout:
            log(tag, line.rstrip())

    threading.Thread(target=pump, daemon=True).start()
    return p


def wait_health(url: str, timeout: float = 30) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def shutdown():
    log("start", "กำลังปิดทุกโปรเซส...")
    for tag, p in reversed(procs):
        if p.poll() is None:
            try:
                if IS_WIN:  # ปิดทั้ง tree (npm -> node, python -> ...) ให้หมด
                    subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
            except Exception:
                pass
    for tag, p in procs:
        try:
            p.wait(timeout=5)
        except Exception:
            pass
    log("start", "ปิดเรียบร้อย")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sim", type=int, metavar="SEC", help="ใช้ตัวจำลองส่งผลตรวจทุก SEC วินาที แทนกล้อง")
    ap.add_argument("--no-detect", action="store_true", help="ไม่เปิดตัวตรวจ")
    ap.add_argument("--dev", action="store_true", help="เปิด vite dev server (พอร์ต 5173)")
    ap.add_argument("--build", action="store_true", help="build หน้าเว็บใหม่ก่อนเริ่ม")
    ap.add_argument("--no-browser", action="store_true", help="ไม่เปิด browser")
    ap.add_argument("-c", "--config", default="config.yaml", help="config ของตัวตรวจ")
    args = ap.parse_args()

    if IS_WIN:
        # os.system("") กับสตริงว่างคงที่ = trick มาตรฐานให้ console Windows เปิดโหมดสี ANSI ไม่มี input จากผู้ใช้จึงปลอดภัย
        os.system("")
    for stream in (sys.stdout, sys.stderr):  # ให้ข้อความไทยแสดงถูกทุก console
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    port = json.loads((BACKEND / "config.json").read_text(encoding="utf-8")).get("http_port", 8000)
    url = f"http://localhost:{port}"

    # ---------- ติดตั้ง dependency ครั้งแรก ----------
    for d in (BACKEND, FRONTEND):
        if not (d / "node_modules").exists():
            log("start", f"ติดตั้ง dependency ใน {d.name}/ (ครั้งแรกเท่านั้น)...")
            subprocess.run([npm(), "install"], cwd=str(d), check=True)

    # ---------- build หน้าเว็บ ----------
    if not args.dev and (args.build or not (FRONTEND / "dist" / "index.html").exists()):
        log("start", "build หน้าเว็บ (frontend/dist)...")
        subprocess.run([npm(), "run", "build"], cwd=str(FRONTEND), check=True)

    try:
        # ---------- backend ----------
        spawn("backend", ["node", "--no-warnings=ExperimentalWarning", "server.js"], BACKEND)
        if not wait_health(f"{url}/api/health"):
            log("start", f"backend ไม่ตอบที่ {url} ภายใน 30 วิ (พอร์ตถูกใช้อยู่? มี backend เดิมรันอยู่?)")
            return 1
        log("start", f"backend พร้อมที่ {url}")

        # ---------- vite dev (ถ้าขอ) ----------
        open_url = url
        if args.dev:
            spawn("vite", [npm(), "run", "dev"], FRONTEND)
            open_url = "http://localhost:5173"
            time.sleep(2)

        # ---------- ตัวตรวจ / ตัวจำลอง ----------
        if args.sim:
            spawn("sim", ["node", "--no-warnings=ExperimentalWarning", "simulate.js", str(args.sim)], BACKEND)
        elif not args.no_detect:
            spawn("detect", [sys.executable, "-u", "run_detect.py", "-c", args.config], ROOT)

        if not args.no_browser:
            webbrowser.open(open_url)
        log("start", f"ทุกอย่างพร้อม เปิด {open_url}  |  Ctrl+C เพื่อปิดทั้งหมด")

        # ---------- รอ: ถ้า backend ตาย ให้ปิดทั้งหมด ----------
        while True:
            time.sleep(1)
            for tag, p in list(procs):  # วนบน copy เพราะอาจ remove ระหว่างลูป
                if p.poll() is not None and tag == "backend":
                    log("start", f"backend หยุดทำงาน (exit {p.returncode}) -> ปิดทั้งหมด")
                    return 1
                if p.poll() is not None and tag == "detect":
                    log("start", "ตัวตรวจปิดแล้ว (กด q ในหน้าต่างวิดีโอ) backend และหน้าเว็บยังทำงานต่อ")
                    procs.remove((tag, p))
    except KeyboardInterrupt:
        pass
    finally:
        shutdown()
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal.default_int_handler)
    sys.exit(main())
