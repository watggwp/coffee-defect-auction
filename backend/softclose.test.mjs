// softclose.test.mjs - ทดสอบกติกาต่อเวลาอัตโนมัติ (ต้องรัน npm start ไว้ก่อน): node softclose.test.mjs
const B = "http://localhost:8000";
const j = (r) => r.json();
const post = (p, b) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await j(r) }));
// PUT /api/settings ต้องเป็น admin -> login ก่อนแล้วแนบ token
let TOKEN = "";
const put = (p, b) => fetch(B + p, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(b) }).then(j);
async function loginAdmin() {
  const cfg = JSON.parse((await import("node:fs")).readFileSync(new URL("./config.json", import.meta.url), "utf-8"));
  try { process.loadEnvFile(new URL("./.env", import.meta.url)); } catch { /* ไม่มี .env */ }
  const password = process.env[cfg.admin?.password_env || "ADMIN_PASSWORD"] || cfg.admin?.default_password || "admin1234";
  const r = await fetch(B + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  if (!r.ok) throw new Error("admin login failed: " + (await r.text()));
  TOKEN = (await r.json()).token;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const secsLeft = (lot) => ((new Date(lot.ends_at) - Date.now()) / 1000).toFixed(1);

let ok = false;
for (let i = 0; i < 30 && !ok; i++) { try { ok = (await fetch(B + "/api/health")).ok; } catch { await sleep(500); } }
if (!ok) die("backend not up");
await loginAdmin().catch((e) => die(e.message));

// เปิด soft close: หน้าต่าง 10 วิ ต่อเป็น 10 วิ สูงสุด 2 ครั้ง
let s = await put("/api/settings", { soft_close: { enabled: true, extend_window_seconds: 10, extend_to_seconds: 10, max_extensions: 2 } });
console.log("settings:", JSON.stringify(s.soft_close));

// ล็อตสั้น 6 วิ (อยู่ในหน้าต่างทันที)
let { body: lot } = await post("/api/lots", { duration_seconds: 6, detections: [{ class: "Broken", confidence: 0.9 }] });
console.log(`lot #${lot.id} เหลือ ${secsLeft(lot)} วิ`);

let r = await post(`/api/lots/${lot.id}/bids`, { bidder: "A", amount: 50 });
console.log(`bid A -> extended=${r.body.extended} extensions=${r.body.extensions} เหลือ ${secsLeft(r.body)} วิ`);
if (!r.body.extended || Number(secsLeft(r.body)) < 9) die("ครั้งที่ 1 ควรต่อเป็น ~10 วิ");

r = await post(`/api/lots/${lot.id}/bids`, { bidder: "B", amount: 60 });
console.log(`bid B -> extended=${r.body.extended} extensions=${r.body.extensions} เหลือ ${secsLeft(r.body)} วิ`);
if (!r.body.extended || r.body.extensions !== 2) die("ครั้งที่ 2 ควรต่อได้ (ยังไม่เกิน max 2)");

r = await post(`/api/lots/${lot.id}/bids`, { bidder: "A", amount: 70 });
console.log(`bid A -> extended=${r.body.extended} extensions=${r.body.extensions} (max 2 ครบแล้ว)`);
if (r.body.extended) die("ครั้งที่ 3 ต้องไม่ต่อ เพราะครบ max_extensions");

// max_extensions = 0 -> ไม่จำกัด
await put("/api/settings", { soft_close: { max_extensions: 0 } });
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "B", amount: 80 });
console.log(`max=0 (ไม่จำกัด) bid B -> extended=${r.body.extended} extensions=${r.body.extensions}`);
if (!r.body.extended) die("max_extensions=0 ต้องต่อได้ไม่จำกัด");

// ปิด soft close -> ไม่ต่อ
await put("/api/settings", { soft_close: { enabled: false } });
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "A", amount: 90 });
console.log(`ปิด soft close: bid A -> extended=${r.body.extended} เหลือ ${secsLeft(r.body)} วิ`);
if (r.body.extended) die("ปิดแล้วต้องไม่ต่อเวลา");

// ล็อตนอกหน้าต่าง (เหลือ 30 วิ) ต้องไม่ต่อแม้เปิดอยู่
await put("/api/settings", { soft_close: { enabled: true } });
({ body: lot } = await post("/api/lots", { duration_seconds: 30, detections: [{ class: "Cut", confidence: 0.8 }] }));
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "A", amount: 60 });
console.log(`ล็อตเหลือ 30 วิ bid -> extended=${r.body.extended} (นอกหน้าต่าง 10 วิ)`);
if (r.body.extended) die("นอกหน้าต่างต้องไม่ต่อ");

// คืนค่าเริ่มต้น
await put("/api/settings", { soft_close: { enabled: true, extend_window_seconds: 10, extend_to_seconds: 10, max_extensions: 10 } });
console.log("SOFT CLOSE OK");
