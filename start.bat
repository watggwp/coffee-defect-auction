@echo off
REM ดับเบิลคลิกเพื่อเปิดทั้งระบบ (backend + หน้าเว็บ + ตัวตรวจ) | ปิดด้วย Ctrl+C หรือปิดหน้าต่างนี้
REM ส่ง argument ต่อได้ เช่น start.bat --sim 5  หรือ  start.bat --no-detect
chcp 65001 >nul
cd /d "%~dp0"
python start_all.py %*
pause
