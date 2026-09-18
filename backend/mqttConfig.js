// mqttConfig.js - รวมค่า MQTT ของ backend ให้เป็นชุดเดียว
// ถ้า config.json -> mqtt.detector_config ชี้ไปที่ config.yaml ของตัวตรวจ จะอ่าน host/port/user/pass/topic จากที่นั่น
// (ตั้งค่า broker ที่เดียว ไม่ต้องคัดลอกรหัสผ่านมาไว้สองไฟล์)
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export function resolveMqtt(cfg) {
  const m = cfg.mqtt;
  const out = {
    embedded: Boolean(m.embedded_broker),
    brokerPort: m.broker_port ?? 1883,
    url: m.external_url,
    topic: m.topic,
    username: m.username || undefined,
    password: m.password || undefined,
    source: "backend/config.json",
  };
  if (m.embedded_broker) {
    out.url = `mqtt://localhost:${out.brokerPort}`;
    return out;
  }
  if (m.detector_config) {
    const p = fileURLToPath(new URL(m.detector_config, import.meta.url));
    if (existsSync(p)) {
      const y = parseYaml(readFileSync(p, "utf-8"))?.mqtt ?? {};
      out.url = `mqtt://${y.host ?? "localhost"}:${y.port ?? 1883}`;
      out.topic = y.topic ?? out.topic;
      out.username = y.username || undefined;
      out.password = y.password || undefined;
      out.source = m.detector_config;
    } else {
      console.warn(`[MQTT] ไม่พบ ${p} -> ใช้ค่าจาก backend/config.json`);
    }
  }
  return out;
}

export function connectOptions(mq, clientId) {
  return {
    clientId,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    ...(mq.username ? { username: mq.username, password: mq.password } : {}),
  };
}
