"""
list_cameras.py - หาเลข index ของกล้องแต่ละตัว (รวม OBS Virtual Camera)
รัน: python list_cameras.py
จะเปิดหน้าต่างพรีวิวทีละตัว กดปุ่มใดก็ได้เพื่อไปตัวถัดไป และบันทึกภาพ cam_<index>.jpg ไว้ดูย้อนหลัง
"""
import cv2

MAX_INDEX = 6
found = []
for i in range(MAX_INDEX):
    for name, be in (("dshow", cv2.CAP_DSHOW), ("msmf", cv2.CAP_MSMF)):
        cap = cv2.VideoCapture(i, be)
        ok = cap.isOpened()
        ret, frame = (cap.read() if ok else (False, None))
        if ret:
            for _ in range(5):
                ret, frame = cap.read()
        cap.release()
        if ret:
            h, w = frame.shape[:2]
            print(f"index {i}  backend={name:5s}  {w}x{h}  -> ตั้งใน config: input: {i} / backend: {name}")
            found.append((i, name))
            cv2.imwrite(f"cam_{i}_{name}.jpg", frame)
            cv2.putText(frame, f"index {i} ({name}) - press any key", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.imshow("camera preview", frame)
            cv2.waitKey(0)
            break
if not found:
    print("ไม่พบกล้องเลย")
cv2.destroyAllWindows()
