// simulate.js - ยิงผลตรวจจำลองเข้า MQTT ทุก N วินาที (payload รูปแบบเดียวกับ run_detect.py)
//   npm run simulate        ส่งทุก 15 วิ
//   npm run simulate 5      ส่งทุก 5 วิ
// ใช้ broker/topic ชุดเดียวกับ backend (ดู mqttConfig.js)
import { readFileSync } from "node:fs";
import mqtt from "mqtt";
import { resolveMqtt, connectOptions } from "./mqttConfig.js";

const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf-8"));
const mq = resolveMqtt(cfg);
const intervalSec = Number(process.argv[2]) || 15;
const classes = Object.keys(cfg.auction.start_price_by_class);
// topic ที่ backend subscribe อาจมี wildcard (+/#) -> แทนด้วยชื่อกล้องจำลอง
const topic = mq.topic.replace("+", "sim-cam").replace("#", "sim-cam/detections");

const client = mqtt.connect(mq.url, connectOptions(mq, "simulator"));
let tid = 1;
client.on("connect", () => {
  console.log(`[SIM] connected ${mq.url} topic=${topic}, ส่งทุก ${intervalSec} วิ (Ctrl+C เพื่อหยุด)`);
  const send = () => {
    const n = 1 + Math.floor(Math.random() * 3);
    const detections = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      track_id: tid++,
      class: classes[Math.floor(Math.random() * classes.length)],
      confidence: Math.round((0.5 + Math.random() * 0.5) * 10000) / 10000,
    }));
    const payload = { device: "sim-cam", time: new Date().toISOString(), count: n, detections };
    client.publish(topic, JSON.stringify(payload));
    console.log(`[SIM] sent ${detections.map((d) => `${d.class} ${(d.confidence * 100).toFixed(0)}%`).join(", ")}`);
  };
  send();
  setInterval(send, intervalSec * 1000);
});
client.on("error", (e) => console.error("[SIM]", e.message));
