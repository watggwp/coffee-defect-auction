"""
run_detect.py - รันโมเดล YOLO (.pt) กับวิดีโอ/webcam แบบ real-time
แสดง FPS, กรอบวัตถุที่ตรวจเจอ, ชื่อคลาส, ค่าความมั่นใจ และหลอดโหลดใต้กรอบ
เมื่อเจอวัตถุเดิมต่อเนื่องครบ hold_seconds จะส่งผลขึ้น MQTT 1 ครั้ง (ไม่ส่งซ้ำจนกว่าวัตถุจะหายจากภาพ)
ตั้งค่าทั้งหมดใน config.yaml

ใช้งาน:
    python run_detect.py                    # ใช้ config.yaml
    python run_detect.py -c my_config.yaml  # ใช้ config อื่น
กด q หรือ ESC เพื่อออก
"""
import argparse
import json
import time
from datetime import datetime

import cv2
import torch
import yaml
from ultralytics import YOLO


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


class MqttSender:
    """ส่งผลตรวจขึ้น MQTT: 1 message ต่อครั้ง ข้างในเป็น list แยกแต่ละวัตถุ"""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.enabled = bool(cfg.get("enable", False))
        self.client = None
        self.last_sent = 0.0
        if not self.enabled:
            return
        import paho.mqtt.client as mqtt

        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        if cfg.get("username"):
            self.client.username_pw_set(cfg["username"], cfg.get("password") or None)
        try:
            self.client.connect(cfg.get("host", "localhost"), int(cfg.get("port", 1883)), keepalive=30)
            self.client.loop_start()  # จัดการ reconnect เองใน background
            print(f"[INFO] MQTT -> {cfg.get('host')}:{cfg.get('port')} topic={cfg.get('topic')}")
        except Exception as e:
            print(f"[WARN] MQTT ต่อไม่ได้ ({e}) -> ปิดการส่ง")
            self.enabled = False

    def publish(self, detections: list, frame_shape: tuple):
        if not self.enabled:
            return
        if self.cfg.get("only_when_detected", True) and not detections:
            return
        now = time.time()
        if now - self.last_sent < float(self.cfg.get("min_interval", 0) or 0):
            return
        self.last_sent = now
        payload = {
            "device": self.cfg.get("device_id", "cam1"),
            "time": datetime.now().astimezone().isoformat(timespec="milliseconds"),
            "count": len(detections),
            "detections": [
                {
                    "id": i + 1,
                    "track_id": d.get("tid"),
                    "class": d["class"],
                    "confidence": round(d["conf"], 4),
                }
                for i, d in enumerate(detections)
            ],
        }
        self.client.publish(self.cfg["topic"], json.dumps(payload, ensure_ascii=False),
                            qos=int(self.cfg.get("qos", 0)))

    def close(self):
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()


class TrackHold:
    """นับเวลาที่เจอวัตถุ (track id) เดิมต่อเนื่อง ครบ hold_seconds -> พร้อมส่ง 1 ครั้ง
    ส่งแล้วจะไม่ส่งซ้ำจนกว่าวัตถุนั้นหายจากภาพเกิน lost_seconds (กลับมาใหม่ = นับใหม่)"""

    def __init__(self, hold_seconds: float, lost_seconds: float):
        self.hold = float(hold_seconds)
        self.lost = float(lost_seconds)
        self.tracks = {}  # tid -> {"first": t, "last": t, "sent": bool}

    def update(self, track_ids: list, now: float):
        """คืน (progress: tid->0..1, sent: tid->bool, ready: list tid ที่ครบเวลาในเฟรมนี้)"""
        # ลบ track ที่หายจากภาพนานเกิน lost_seconds ก่อน (ถ้ากลับมาในเฟรมนี้จะเริ่มนับใหม่)
        for tid in [t for t, st in self.tracks.items() if now - st["last"] > self.lost]:
            del self.tracks[tid]
        ready = []
        for tid in track_ids:
            st = self.tracks.get(tid)
            if st is None:
                st = self.tracks[tid] = {"first": now, "last": now, "sent": False}
            st["last"] = now
            if not st["sent"] and now - st["first"] >= self.hold:
                st["sent"] = True
                ready.append(tid)
        progress, sent = {}, {}
        for tid in track_ids:
            st = self.tracks[tid]
            progress[tid] = 1.0 if self.hold <= 0 else min(1.0, (now - st["first"]) / self.hold)
            sent[tid] = st["sent"]
        return progress, sent, ready


def draw_progress_bar(frame, x1: int, y2: int, x2: int, ratio: float, done: bool, height: int, color):
    """หลอดโหลดใต้กรอบ: พื้นเทา, เติมสีคลาสตามเวลา, เขียวเมื่อส่งแล้ว"""
    h = frame.shape[0]
    top = min(y2 + 2, h - height - 1)
    cv2.rectangle(frame, (x1, top), (x2, top + height), (60, 60, 60), -1)
    fill = int(x1 + (x2 - x1) * max(0.0, min(1.0, ratio)))
    bar_color = (0, 220, 0) if done else color
    if fill > x1:
        cv2.rectangle(frame, (x1, top), (fill, top + height), bar_color, -1)
    cv2.rectangle(frame, (x1, top), (x2, top + height), (200, 200, 200), 1)


def class_color(idx: int) -> tuple:
    """สีคงที่ต่อคลาส (BGR)"""
    palette = [
        (56, 56, 255), (151, 157, 255), (31, 112, 255), (29, 178, 255),
        (49, 210, 207), (10, 249, 72), (23, 204, 146), (134, 219, 61),
        (52, 147, 26), (187, 212, 0), (168, 153, 44), (255, 194, 0),
        (147, 69, 52), (255, 115, 100), (236, 24, 0), (255, 56, 132),
        (133, 0, 82), (255, 56, 203), (200, 149, 255), (199, 55, 255),
    ]
    return palette[idx % len(palette)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-c", "--config", default="config.yaml", help="path ไฟล์ config")
    args = ap.parse_args()
    cfg = load_config(args.config)

    m_cfg, s_cfg, d_cfg, o_cfg = cfg["model"], cfg["source"], cfg["display"], cfg["output"]
    mqtt_sender = MqttSender(cfg.get("mqtt", {}))

    t_cfg = cfg.get("trigger", {})
    hold = TrackHold(t_cfg.get("hold_seconds", 3.0), t_cfg.get("lost_seconds", 1.0))
    bar_h = int(t_cfg.get("bar_height", 6))
    tracker_yaml = t_cfg.get("tracker", "bytetrack.yaml")

    # ---------- device ----------
    device = m_cfg.get("device", 0)
    if device != "cpu" and not torch.cuda.is_available():
        print("[WARN] ไม่พบ CUDA -> เปลี่ยนไปใช้ CPU")
        device = "cpu"
    use_half = bool(m_cfg.get("half", False)) and device != "cpu"
    if device != "cpu":
        print(f"[INFO] GPU: {torch.cuda.get_device_name(int(device))}  half={use_half}")
    else:
        print("[INFO] ใช้ CPU")

    # ---------- model ----------
    model = YOLO(m_cfg["path"])
    names = model.names

    # ---------- source ----------
    src = s_cfg["input"]
    backend = {"dshow": cv2.CAP_DSHOW, "msmf": cv2.CAP_MSMF}.get(str(s_cfg.get("backend", "auto")).lower(), cv2.CAP_ANY)
    if str(src).isdigit():
        cap = cv2.VideoCapture(int(src), backend)
        if not cap.isOpened() and backend == cv2.CAP_ANY:  # กล้องเสมือน (OBS) บางตัวเปิดได้เฉพาะ DSHOW
            cap = cv2.VideoCapture(int(src), cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(src)
    if str(src).isdigit():
        if s_cfg.get("width"):
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, s_cfg["width"])
        if s_cfg.get("height"):
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, s_cfg["height"])
    if not cap.isOpened():
        raise SystemExit(f"[ERROR] เปิด source ไม่ได้: {src}  (ลองเปลี่ยน input/backend ดูเลขกล้องด้วย python list_cameras.py)")
    is_camera = str(src).isdigit()
    if is_camera:
        ok, _ = cap.read()
        if not ok:
            raise SystemExit(
                f"[ERROR] เปิดกล้อง index {src} ได้แต่ไม่มีภาพ มักเกิดจากโปรแกรมอื่น (เช่น OBS) ใช้กล้องตัวนี้อยู่ "
                "-> ถ้าต้องการภาพจาก OBS ให้ตั้ง input เป็นเลขของ OBS Virtual Camera และ backend: dshow"
            )

    # ---------- writer ----------
    writer = None
    if o_cfg.get("save_video"):
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps_src = cap.get(cv2.CAP_PROP_FPS) or 30
        writer = cv2.VideoWriter(o_cfg["save_path"], cv2.VideoWriter_fourcc(*"mp4v"), fps_src, (w, h))
        print(f"[INFO] บันทึกวิดีโอไปที่ {o_cfg['save_path']}")

    win = d_cfg.get("window_name", "Detection")
    thick = int(d_cfg.get("box_thickness", 2))
    fscale = float(d_cfg.get("font_scale", 0.6))
    font = cv2.FONT_HERSHEY_SIMPLEX

    fps_smooth = 0.0
    prev_t = time.perf_counter()
    t_start, n_frames, n_sent = prev_t, 0, 0
    print(f"[INFO] เริ่มตรวจจับ... เจอต่อเนื่อง {hold.hold:.1f} วิ จึงส่ง | กด q หรือ ESC เพื่อออก")

    while True:
        ok, frame = cap.read()
        if not ok:
            if is_camera:  # กล้องสด: ลองอ่านซ้ำสั้นๆ ก่อนยอมแพ้ (สัญญาณสะดุด/OBS เปลี่ยนฉาก)
                for _ in range(30):
                    time.sleep(0.1)
                    ok, frame = cap.read()
                    if ok:
                        break
            if not ok:
                print("[INFO] จบวิดีโอ / อ่านเฟรมไม่ได้ (กล้องถูกปิดหรือถูกโปรแกรมอื่นใช้อยู่)")
                break

        # track() = detect + ให้ track id เดิมกับวัตถุเดิมข้ามเฟรม
        results = model.track(
            frame,
            persist=True,
            tracker=tracker_yaml,
            imgsz=m_cfg.get("imgsz", 640),
            conf=m_cfg.get("conf", 0.25),
            iou=m_cfg.get("iou", 0.45),
            device=device,
            half=use_half,
            verbose=False,
        )[0]
        now = time.perf_counter()

        # ---------- collect detections ----------
        detections = []
        if results.boxes is not None and len(results.boxes):
            ids = results.boxes.id
            for k, box in enumerate(results.boxes):
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                cls_id = int(box.cls[0])
                detections.append({
                    "class": names.get(cls_id, str(cls_id)),
                    "conf": float(box.conf[0]),
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "cls_id": cls_id,
                    "tid": int(ids[k]) if ids is not None else None,
                })

        # ---------- hold timer -> MQTT ----------
        tracked_ids = [d["tid"] for d in detections if d["tid"] is not None]
        progress, sent_map, ready_ids = hold.update(tracked_ids, now)
        to_send = [d for d in detections if d["tid"] in ready_ids]
        if to_send:
            mqtt_sender.publish(to_send, frame.shape)
            n_sent += 1
            print(f"[SEND] {datetime.now().strftime('%H:%M:%S')} "
                  + ", ".join(f"#{d['tid']} {d['class']} {d['conf']*100:.0f}%" for d in to_send))

        # ---------- draw ----------
        for d in detections:
            x1, y1, x2, y2 = d["x1"], d["y1"], d["x2"], d["y2"]
            color = class_color(d["cls_id"])
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, thick)
            if d["tid"] is not None:
                draw_progress_bar(frame, x1, y2, x2, progress.get(d["tid"], 0.0),
                                  sent_map.get(d["tid"], False), bar_h, color)
                label = f"#{d['tid']} {d['class']}"
            else:
                label = d["class"]
            if d_cfg.get("show_conf", True):
                label = f"{label} {d['conf']*100:.1f}%"
            (tw, th), _ = cv2.getTextSize(label, font, fscale, 1)
            ty = y1 - 4 if y1 - th - 8 > 0 else y1 + th + 4
            cv2.rectangle(frame, (x1, ty - th - 4), (x1 + tw + 4, ty + 2), color, -1)
            cv2.putText(frame, label, (x1 + 2, ty - 2), font, fscale, (255, 255, 255), 1, cv2.LINE_AA)

        # ---------- FPS ----------
        inst_fps = 1.0 / max(now - prev_t, 1e-6)
        prev_t = now
        fps_smooth = inst_fps if fps_smooth == 0 else fps_smooth * 0.9 + inst_fps * 0.1
        if d_cfg.get("show_fps", True):
            txt = f"FPS: {fps_smooth:.1f}  |  Detections: {len(detections)}  |  Sent: {n_sent}"
            cv2.rectangle(frame, (5, 5), (10 + len(txt) * 11, 32), (0, 0, 0), -1)
            cv2.putText(frame, txt, (10, 26), font, 0.65, (0, 255, 0), 2, cv2.LINE_AA)

        if writer is not None:
            writer.write(frame)

        show = frame
        rw = int(d_cfg.get("resize_to", 0) or 0)
        if rw > 0 and frame.shape[1] != rw:
            rh = int(frame.shape[0] * rw / frame.shape[1])
            show = cv2.resize(frame, (rw, rh))
        cv2.imshow(win, show)

        n_frames += 1
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break

    cap.release()
    if writer is not None:
        writer.release()
    mqtt_sender.close()
    cv2.destroyAllWindows()
    elapsed = time.perf_counter() - t_start
    if n_frames:
        print(f"[INFO] เฟรมทั้งหมด {n_frames}  FPS เฉลี่ย {n_frames/elapsed:.1f}  ส่ง MQTT {n_sent} ครั้ง")
    print("[INFO] ปิดโปรแกรม")


if __name__ == "__main__":
    main()
