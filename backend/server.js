// server.js - backend ประมูล: MQTT (รับผลตรวจ) -> สร้างล็อต -> REST + WebSocket ให้หน้าเว็บ
//   npm start          รันเซิร์ฟเวอร์
//   npm run simulate   ยิงผลตรวจจำลองเข้า MQTT เพื่อทดสอบโดยไม่ต้องเปิดกล้อง
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import mqtt from "mqtt";
import { openDb } from "./db.js";
import { resolveMqtt, connectOptions } from "./mqttConfig.js";

const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf-8"));
const db = openDb(cfg.db_file);

// กติกาที่เปลี่ยนได้ตอนรัน (จากหน้าเว็บผ่าน PUT /api/settings) ค่าเริ่มมาจาก config.json
const sc0 = cfg.auction.soft_close ?? {};
const settings = {
  duration_seconds: cfg.auction.duration_seconds,
  min_increment: cfg.auction.min_increment,
  soft_close: {
    enabled: sc0.enabled ?? true,
    extend_window_seconds: sc0.extend_window_seconds ?? 10,
    extend_to_seconds: sc0.extend_to_seconds ?? 10,
    max_extensions: sc0.max_extensions ?? 10, // 0 = ไม่จำกัด
  },
};
const bidRules = () => ({
  minIncrement: settings.min_increment,
  softClose: {
    enabled: settings.soft_close.enabled,
    windowSec: settings.soft_close.extend_window_seconds,
    extendToSec: settings.soft_close.extend_to_seconds,
    maxExtensions: settings.soft_close.max_extensions,
  },
});

// ---------------- MQTT broker ----------------
// embedded_broker: true  = รัน broker ในตัว (Aedes) ไม่ต้องติดตั้ง Mosquitto
// embedded_broker: false = ต่อ broker ภายนอก โดยอ่านค่าจาก config.yaml ของตัวตรวจ (ดู mqttConfig.js)
const mq = resolveMqtt(cfg);
const brokerUrl = mq.url;
if (mq.embedded) {
  const { Aedes } = await import("aedes");
  const net = await import("node:net");
  const aedes = await Aedes.createBroker();
  await new Promise((res) => net.createServer(aedes.handle).listen(mq.brokerPort, res));
  aedes.on("client", (c) => console.log(`[MQTT] client connected: ${c.id}`));
  console.log(`[MQTT] embedded broker on port ${mq.brokerPort}`);
} else {
  console.log(`[MQTT] external broker ${brokerUrl} (settings from ${mq.source}${mq.username ? ", auth on" : ""})`);
}

// ---------------- HTTP + WebSocket ----------------
const app = express();
app.use(cors());
app.use(express.json());
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

function broadcast(type, data, extra = {}) {
  const msg = JSON.stringify({ type, data, ts: new Date().toISOString(), ...extra });
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
}
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "snapshot", data: db.listLots("open"), ts: new Date().toISOString() }));
  ws.send(JSON.stringify({ type: "settings", data: settings, ts: new Date().toISOString() }));
});

// ---------------- REST API ----------------
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, clients: wss.clients.size, broker: brokerUrl, time: new Date().toISOString() }));

app.get("/api/lots", (req, res) => {
  const status = req.query.status; // open | sold | unsold | (ว่าง = ทั้งหมด)
  res.json(db.listLots(status || null, Number(req.query.limit) || 100));
});

app.get("/api/lots/:id", (req, res) => {
  const lot = db.getLot(Number(req.params.id));
  if (!lot) return res.status(404).json({ error: "ไม่พบล็อตนี้" });
  res.json({ ...lot, bids: db.bidsForLot(lot.id) });
});

app.post("/api/lots/:id/bids", (req, res) => {
  const bidder = String(req.body?.bidder || "").trim().slice(0, 40);
  const amount = Number(req.body?.amount);
  if (!bidder) return res.status(400).json({ error: "กรุณาใส่ชื่อผู้เสนอราคา" });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });
  try {
    const { lot, extended } = db.placeBid(Number(req.params.id), bidder, amount, bidRules());
    broadcast("bid", lot, { extended });
    if (extended) {
      broadcast("lot_extended", lot);
      console.log(`[LOT] #${lot.id} ต่อเวลาครั้งที่ ${lot.extensions} -> ปิด ${lot.ends_at}`);
    }
    res.json({ ...lot, extended });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message, min: e.min });
  }
});

// กติกาประมูล: ดู / แก้ตอนรัน (soft close เปิด-ปิด, หน้าต่างเวลา, จำนวนครั้งสูงสุด 0 = ไม่จำกัด)
app.get("/api/settings", (_req, res) => res.json(settings));
app.put("/api/settings", (req, res) => {
  const inp = req.body?.soft_close ?? {};
  const sc = settings.soft_close;
  const num = (v, cur, min) => (v === undefined ? cur : Math.max(min, Math.floor(Number(v)) || 0));
  if (inp.enabled !== undefined) sc.enabled = Boolean(inp.enabled);
  sc.extend_window_seconds = num(inp.extend_window_seconds, sc.extend_window_seconds, 1);
  sc.extend_to_seconds = num(inp.extend_to_seconds, sc.extend_to_seconds, 1);
  sc.max_extensions = num(inp.max_extensions, sc.max_extensions, 0);
  console.log(`[SETTINGS] soft_close ${JSON.stringify(sc)}`);
  broadcast("settings", settings);
  res.json(settings);
});

// สร้างล็อตด้วยมือ (ไว้ทดสอบหน้าเว็บโดยไม่ต้องผ่าน MQTT) duration_seconds ใส่ได้เพื่อทดสอบล็อตสั้นๆ
app.post("/api/lots", (req, res) => {
  const lot = createLotFromDetection({
    device: req.body?.device || "manual",
    time: new Date().toISOString(),
    detections: req.body?.detections || [{ class: "Broken", confidence: 0.9 }],
  }, Number(req.body?.duration_seconds) || undefined);
  res.status(201).json(lot);
});

// ---------------- Business logic ----------------
function createLotFromDetection(payload, durationSec = settings.duration_seconds) {
  const dets = (payload.detections || []).map((d) => ({
    class: d.class, confidence: d.confidence, track_id: d.track_id ?? null,
  }));
  if (!dets.length) return null;
  // คลาสหลัก = คลาสที่ confidence สูงสุด ใช้กำหนดราคาเริ่ม
  const main = dets.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  const startPrice = cfg.auction.start_price_by_class[main.class] ?? cfg.auction.default_start_price;
  const endsAt = new Date(Date.now() + durationSec * 1000).toISOString();
  const lot = db.createLot({
    device: payload.device || "unknown",
    detected_at: payload.time || new Date().toISOString(),
    main_class: main.class,
    detections: dets,
    start_price: startPrice,
    ends_at: endsAt,
  });
  console.log(`[LOT] #${lot.id} ${lot.main_class} x${dets.length} start ${startPrice} ends ${endsAt}`);
  broadcast("lot_created", lot);
  return lot;
}

// ปิดล็อตที่หมดเวลา ทุก 1 วินาที
setInterval(() => {
  for (const lot of db.expiringLots()) {
    const closed = db.closeLot(lot.id, lot.bid_count > 0 ? "sold" : "unsold");
    console.log(`[LOT] #${closed.id} ${closed.status}` +
      (closed.current_bidder ? ` -> ${closed.current_bidder} ${closed.current_price}` : ""));
    broadcast("lot_closed", closed);
  }
}, 1000);

// ---------------- MQTT subscriber (รับจาก run_detect.py) ----------------
const client = mqtt.connect(brokerUrl, connectOptions(mq, "auction-backend"));
client.on("connect", () => {
  client.subscribe(mq.topic);
  console.log(`[MQTT] subscribed ${mq.topic} @ ${brokerUrl}`);
});
client.on("reconnect", () => console.log(`[MQTT] reconnecting ${brokerUrl}...`));
client.on("message", (topic, buf) => {
  try {
    const payload = JSON.parse(buf.toString());
    console.log(`[MQTT] ${topic} count=${payload.count}`);
    createLotFromDetection(payload);
  } catch (e) {
    console.warn(`[MQTT] payload ไม่ถูกต้องจาก ${topic}: ${e.message}`);
  }
});
client.on("error", (e) => console.warn(`[MQTT] ${e.message}`));

// ---------------- เสิร์ฟหน้าเว็บที่ build แล้ว (frontend/dist) จากพอร์ตเดียวกัน ----------------
const distDir = new URL("../frontend/dist/", import.meta.url);
if (existsSync(distDir)) {
  app.use(express.static(fileURLToPath(distDir)));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(fileURLToPath(new URL("index.html", distDir))));
  console.log("[HTTP] serving frontend from frontend/dist");
} else {
  console.log("[HTTP] ไม่พบ frontend/dist -> ใช้ npm run dev ในโฟลเดอร์ frontend แทน หรือ npm run build ก่อน");
}

// ---------------- start ----------------
httpServer.listen(cfg.http_port, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log(`[HTTP] http://localhost:${cfg.http_port}  (LAN: ${ips.map((ip) => `http://${ip}:${cfg.http_port}`).join(", ") || "-"})`);
  console.log(`[WS]   ws://localhost:${cfg.http_port}/ws`);
});
