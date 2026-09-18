// db.js - เก็บล็อตและการเสนอราคาลง SQLite (ใช้ node:sqlite ที่มากับ Node 22+ ไม่ต้อง build native)
import { DatabaseSync } from "node:sqlite";

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS lots (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at     TEXT NOT NULL,
      device         TEXT NOT NULL,
      detected_at    TEXT NOT NULL,
      main_class     TEXT NOT NULL,
      detections     TEXT NOT NULL,          -- JSON list [{class, confidence, track_id}]
      start_price    REAL NOT NULL,
      current_price  REAL NOT NULL,
      current_bidder TEXT,
      bid_count      INTEGER NOT NULL DEFAULT 0,
      ends_at        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'open'   -- open | sold | unsold
    );
    CREATE TABLE IF NOT EXISTS bids (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lot_id     INTEGER NOT NULL REFERENCES lots(id),
      bidder     TEXT NOT NULL,
      amount     REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bids_lot ON bids(lot_id);
    CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);
  `);
  // migration: ฐานข้อมูลเก่าที่ยังไม่มีคอลัมน์ extensions (จำนวนครั้งที่ต่อเวลา)
  const cols = db.prepare(`PRAGMA table_info(lots)`).all().map((c) => c.name);
  if (!cols.includes("extensions")) db.exec(`ALTER TABLE lots ADD COLUMN extensions INTEGER NOT NULL DEFAULT 0`);

  const q = {
    insertLot: db.prepare(`
      INSERT INTO lots (created_at, device, detected_at, main_class, detections, start_price, current_price, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    getLot: db.prepare(`SELECT * FROM lots WHERE id = ?`),
    listLots: db.prepare(`SELECT * FROM lots WHERE status = ? ORDER BY id DESC LIMIT ?`),
    listAll: db.prepare(`SELECT * FROM lots ORDER BY id DESC LIMIT ?`),
    expiring: db.prepare(`SELECT * FROM lots WHERE status = 'open' AND ends_at <= ?`),
    applyBid: db.prepare(`
      UPDATE lots SET current_price = ?, current_bidder = ?, bid_count = bid_count + 1,
                      ends_at = ?, extensions = ? WHERE id = ?`),
    insertBid: db.prepare(`INSERT INTO bids (lot_id, bidder, amount, created_at) VALUES (?, ?, ?, ?)`),
    bidsForLot: db.prepare(`SELECT * FROM bids WHERE lot_id = ? ORDER BY id DESC`),
    closeLot: db.prepare(`UPDATE lots SET status = ? WHERE id = ?`),
  };

  const rowToLot = (r) => (r ? { ...r, detections: JSON.parse(r.detections) } : null);

  return {
    createLot({ device, detected_at, main_class, detections, start_price, ends_at }) {
      const now = new Date().toISOString();
      const info = q.insertLot.run(now, device, detected_at, main_class, JSON.stringify(detections),
        start_price, start_price, ends_at);
      return rowToLot(q.getLot.get(Number(info.lastInsertRowid)));
    },
    getLot: (id) => rowToLot(q.getLot.get(id)),
    listLots: (status, limit = 100) =>
      (status ? q.listLots.all(status, limit) : q.listAll.all(limit)).map(rowToLot),
    expiringLots: () => q.expiring.all(new Date().toISOString()).map(rowToLot),
    // ทำ bid แบบ atomic: ตรวจ + อัปเดตใน transaction เดียว กันสองคนกดพร้อมกัน
    // rules = { minIncrement, softClose: { enabled, windowSec, extendToSec, maxExtensions (0 = ไม่จำกัด) } }
    // คืน { lot, extended }  extended = true ถ้าครั้งนี้ทำให้เวลาปิดถูกเลื่อนออกไป
    placeBid(lotId, bidder, amount, rules) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const lot = rowToLot(q.getLot.get(lotId));
        const nowMs = Date.now();
        if (!lot) throw Object.assign(new Error("ไม่พบล็อตนี้"), { code: 404 });
        if (lot.status !== "open") throw Object.assign(new Error("ล็อตนี้ปิดประมูลแล้ว"), { code: 409 });
        const endsMs = new Date(lot.ends_at).getTime();
        if (endsMs <= nowMs) throw Object.assign(new Error("หมดเวลาประมูลแล้ว"), { code: 409 });
        const minAllowed = lot.bid_count === 0 ? lot.start_price : lot.current_price + rules.minIncrement;
        if (amount < minAllowed)
          throw Object.assign(new Error(`ต้องเสนออย่างน้อย ${minAllowed} บาท`), { code: 400, min: minAllowed });

        // soft close: เสนอราคาตอนเหลือเวลาน้อยกว่า windowSec -> เลื่อนเวลาปิดเป็น now + extendToSec
        let newEndsMs = endsMs;
        let extensions = lot.extensions;
        const sc = rules.softClose;
        const underLimit = !sc.maxExtensions || sc.maxExtensions <= 0 || extensions < sc.maxExtensions;
        if (sc.enabled && endsMs - nowMs < sc.windowSec * 1000 && underLimit) {
          newEndsMs = Math.max(endsMs, nowMs + sc.extendToSec * 1000); // ไม่ทำให้เวลาสั้นลง
          if (newEndsMs > endsMs) extensions += 1;
        }
        const extended = newEndsMs > endsMs;

        const now = new Date(nowMs).toISOString();
        q.applyBid.run(amount, bidder, new Date(newEndsMs).toISOString(), extensions, lotId);
        q.insertBid.run(lotId, bidder, amount, now);
        db.exec("COMMIT");
        return { lot: rowToLot(q.getLot.get(lotId)), extended };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    bidsForLot: (id) => q.bidsForLot.all(id),
    closeLot(id, status) {
      q.closeLot.run(status, id);
      return rowToLot(q.getLot.get(id));
    },
  };
}
