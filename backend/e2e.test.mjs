// e2e.test.mjs - ทดสอบ backend ครบวงจร (ต้องรัน npm start ไว้ก่อน): npm test
import mqtt from "mqtt";
import { readFileSync } from "node:fs";
import { resolveMqtt, connectOptions } from "./mqttConfig.js";
const B = "http://localhost:8000";
const MQ = resolveMqtt(JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf-8")));
const TOPIC = MQ.topic.replace("+", "cam1").replace("#", "cam1/detections");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (p, body) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await j(r) }));
const die = (m) => { console.error("FAIL:", m); process.exit(1); };

// 1. wait for health
let ok = false;
for (let i = 0; i < 30 && !ok; i++) { try { ok = (await fetch(B + "/api/health")).ok; } catch { await new Promise(r => setTimeout(r, 500)); } }
if (!ok) die("backend not up");
console.log("health:", await j(await fetch(B + "/api/health")));

// 2. WS listener
const events = [];
const ws = new WebSocket("ws://localhost:8000/ws");
ws.onmessage = (e) => { const m = JSON.parse(e.data); events.push(m.type); };
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej("ws timeout"), 3000); }).catch(die);

// 3. publish MQTT detection
await new Promise((res, rej) => {
  const c = mqtt.connect(MQ.url, connectOptions(MQ, "e2e-test"));
  const to = setTimeout(() => rej(`mqtt connect timeout (${MQ.url})`), 9000);
  c.on("connect", () => c.publish(TOPIC, JSON.stringify({ device: "cam1", time: new Date().toISOString(), count: 2,
    detections: [{ id: 1, track_id: 7, class: "Broken", confidence: 0.9123 }, { id: 2, track_id: 9, class: "Full_Black", confidence: 0.7712 }] }),
    () => { clearTimeout(to); c.end(); res(); }));
  c.on("error", (e) => { clearTimeout(to); rej(e.message); });
}).catch(die);
await new Promise(r => setTimeout(r, 500));

// 4. lot created?
const lots = await j(await fetch(B + "/api/lots?status=open"));
if (!lots.length) die("no lot created");
const lot = lots[0];
console.log(`lot #${lot.id} main=${lot.main_class} start=${lot.start_price} dets=${lot.detections.length} ends=${lot.ends_at}`);

// 5. bids
let r = await post(`/api/lots/${lot.id}/bids`, { bidder: "A", amount: 10 }); console.log("too low ->", r.status, r.body.error);
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "A", amount: 50 }); console.log("A 50    ->", r.status, r.body.current_price, r.body.current_bidder);
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "B", amount: 55 }); console.log("B 55    ->", r.status, r.body.error);
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "B", amount: 60 }); console.log("B 60    ->", r.status, r.body.current_price, r.body.current_bidder, "bids", r.body.bid_count);
r = await post(`/api/lots/${lot.id}/bids`, { bidder: "", amount: 70 }); console.log("no name ->", r.status, r.body.error);

// 6. concurrent same-amount race: only one should win
const race = await Promise.all(["X", "Y", "Z"].map(n => post(`/api/lots/${lot.id}/bids`, { bidder: n, amount: 70 })));
console.log("race 70 x3 ->", race.map(x => x.status).join(","), "winner:", (await j(await fetch(B + `/api/lots/${lot.id}`))).current_bidder);

const detail = await j(await fetch(B + `/api/lots/${lot.id}`));
console.log("bid history:", detail.bids.map(b => `${b.bidder}:${b.amount}`).join(" "));
await new Promise(r => setTimeout(r, 300));
console.log("ws events:", events.join(","));
ws.close();
console.log("E2E OK");
process.exit(0);
