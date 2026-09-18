// auth.js - ระบบยืนยันตัวตนสำหรับ admin (token ในหน่วยความจำ, หมดอายุอัตโนมัติ)
// ออกแบบให้ต่อยอดได้: อนาคตเพิ่ม role "bidder" (Google / email OTP) โดยใช้ session store เดียวกัน
//
// รหัสผ่าน admin อ่านตามลำดับ:
//   1. ตัวแปรแวดล้อม ADMIN_PASSWORD (หรือชื่อที่ตั้งใน config.admin.password_env)
//   2. ไฟล์ backend/.env  (บรรทัด ADMIN_PASSWORD=...)  ไฟล์นี้อยู่ใน .gitignore
//   3. config.admin.default_password  (ค่าเริ่มต้นสำหรับสาธิต จะมีคำเตือนใน log)
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function createAuth(adminCfg = {}) {
  const envName = adminCfg.password_env || "ADMIN_PASSWORD";
  const envFile = fileURLToPath(new URL("./.env", import.meta.url));
  if (!process.env[envName] && existsSync(envFile)) {
    try { process.loadEnvFile(envFile); } catch { /* Node เก่ากว่า 20.12 ไม่มี loadEnvFile */ }
  }
  const password = process.env[envName] || adminCfg.default_password || "admin1234";
  const usingDefault = !process.env[envName];
  if (usingDefault) {
    console.warn(`[AUTH] ใช้รหัสผ่าน admin ค่าเริ่มต้นจาก config.json -> ควรตั้ง ${envName} ใน backend/.env ก่อนใช้จริง`);
  }

  const sessionMs = (adminCfg.session_hours ?? 12) * 3600 * 1000;
  const sessions = new Map(); // token -> { role, createdAt, expiresAt }

  // กัน brute force: นับครั้งที่ผิดต่อ IP ผิดครบ maxFails -> ล็อก lockSeconds
  const fails = new Map(); // ip -> { count, until }
  const maxFails = adminCfg.max_failed_attempts ?? 5;
  const lockMs = (adminCfg.lock_seconds ?? 30) * 1000;

  const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  };

  function login(inputPassword, ip = "?") {
    const f = fails.get(ip);
    if (f && f.until > Date.now()) {
      const wait = Math.ceil((f.until - Date.now()) / 1000);
      return { ok: false, code: 429, error: `ผิดหลายครั้ง ลองใหม่ใน ${wait} วิ`, retry_after: wait };
    }
    if (!safeEqual(inputPassword ?? "", password)) {
      const n = (f?.count ?? 0) + 1;
      fails.set(ip, { count: n, until: n >= maxFails ? Date.now() + lockMs : 0 });
      if (n >= maxFails) fails.set(ip, { count: 0, until: Date.now() + lockMs });
      return { ok: false, code: 401, error: "รหัสผ่านไม่ถูกต้อง", attempts_left: Math.max(0, maxFails - n) };
    }
    fails.delete(ip);
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    sessions.set(token, { role: "admin", createdAt: now, expiresAt: now + sessionMs });
    return { ok: true, token, role: "admin", expires_at: new Date(now + sessionMs).toISOString() };
  }

  function verify(token) {
    const s = token && sessions.get(token);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) { sessions.delete(token); return null; }
    return s;
  }

  function logout(token) { return sessions.delete(token); }

  const tokenFrom = (req) => {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7) : null;
  };

  // Express middleware: ต้องเป็น admin ที่ login แล้ว
  function requireAdmin(req, res, next) {
    const s = verify(tokenFrom(req));
    if (!s || s.role !== "admin") return res.status(401).json({ error: "ต้องเข้าสู่ระบบ admin ก่อน" });
    req.session = s;
    next();
  }

  // ล้าง session หมดอายุทุก 10 นาที
  setInterval(() => {
    const now = Date.now();
    for (const [t, s] of sessions) if (s.expiresAt <= now) sessions.delete(t);
  }, 10 * 60 * 1000).unref();

  return { login, verify, logout, requireAdmin, tokenFrom, usingDefault };
}
