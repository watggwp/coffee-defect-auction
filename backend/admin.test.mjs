// admin.test.mjs - ทดสอบระบบ login admin (ต้องรัน npm start ไว้ก่อน): node admin.test.mjs
import { readFileSync } from "node:fs";
const B = "http://localhost:8000";
const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf-8"));
const password = process.env[cfg.admin?.password_env || "ADMIN_PASSWORD"] || cfg.admin?.default_password || "admin1234";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const post = (p, b, tok) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(b ?? {}) }).then(j);
const put = (p, b, tok) => fetch(B + p, { method: "PUT", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(b) }).then(j);
const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }).then(j);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ok = false;
for (let i = 0; i < 30 && !ok; i++) { try { ok = (await fetch(B + "/api/health")).ok; } catch { await sleep(500); } }
if (!ok) die("backend not up");

let r = await put("/api/settings", { soft_close: { enabled: true } });
console.log("PUT settings ไม่มี token ->", r.status, r.body.error);
if (r.status !== 401) die("ต้องได้ 401");

r = await post("/api/admin/login", { password: "wrong-" + Date.now() });
console.log("login รหัสผิด ->", r.status, r.body.error, "เหลือ", r.body.attempts_left);
if (r.status !== 401) die("รหัสผิดต้องได้ 401");

r = await post("/api/admin/login", { password });
console.log("login ถูก ->", r.status, "token", r.body.token ? "ok" : "MISSING", "หมดอายุ", r.body.expires_at);
if (r.status !== 200 || !r.body.token) die("login ต้องสำเร็จ");
const tok = r.body.token;

r = await get("/api/admin/me", tok);
console.log("GET /admin/me ->", r.status, r.body.role);
if (r.body.role !== "admin") die("me ต้องเป็น admin");

r = await put("/api/settings", { duration_seconds: 45, min_increment: 5 }, tok);
console.log("PUT settings ด้วย token ->", r.status, "duration", r.body.duration_seconds, "min_inc", r.body.min_increment);
if (r.status !== 200 || r.body.duration_seconds !== 45 || r.body.min_increment !== 5) die("admin ต้องแก้ duration/min_increment ได้");

r = await get("/api/settings");
console.log("GET settings (ไม่ต้อง login) ->", r.status, "duration", r.body.duration_seconds);
if (r.status !== 200) die("ทุกคนต้องอ่าน settings ได้");

// คืนค่า
await put("/api/settings", { duration_seconds: 60, min_increment: 10 }, tok);

r = await post("/api/admin/logout", {}, tok);
r = await get("/api/admin/me", tok);
console.log("หลัง logout GET /admin/me ->", r.status);
if (r.status !== 401) die("token หลัง logout ต้องใช้ไม่ได้");

r = await put("/api/settings", { soft_close: { enabled: true } }, "fake-token");
console.log("PUT ด้วย token ปลอม ->", r.status);
if (r.status !== 401) die("token ปลอมต้องได้ 401");

console.log("ADMIN AUTH OK");
