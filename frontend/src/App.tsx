import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  connectWs, fetchLots, fetchSettings, placeBid, updateSoftClose,
  type Lot, type Settings, type SoftClose, type WsMessage,
} from './api'

const DEFAULT_SETTINGS: Settings = {
  duration_seconds: 60,
  min_increment: 10,
  soft_close: { enabled: true, extend_window_seconds: 10, extend_to_seconds: 10, max_extensions: 10 },
}

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtBaht = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท'

// ---------------------------------------------------------------- LotCard
function LotCard({ lot, bidder, now, minIncrement, softClose, onBid, highlight, extendedFlash }: {
  lot: Lot; bidder: string; now: number; minIncrement: number; softClose: SoftClose
  highlight: boolean; extendedFlash: boolean
  onBid: (lotId: number, amount: number) => Promise<void>
}) {
  const remainingMs = new Date(lot.ends_at).getTime() - now
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000))
  const minBid = lot.bid_count === 0 ? lot.start_price : lot.current_price + minIncrement
  const [amount, setAmount] = useState(minBid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isOpen = lot.status === 'open' && remaining > 0
  const isMine = lot.current_bidder === bidder && bidder !== ''
  const canExtend = softClose.enabled && (softClose.max_extensions <= 0 || lot.extensions < softClose.max_extensions)
  const inWindow = isOpen && remainingMs < softClose.extend_window_seconds * 1000

  useEffect(() => { setAmount((a) => (a < minBid ? minBid : a)) }, [minBid])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try { await onBid(lot.id, amount) } catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
  }

  const cls = ['lot', lot.status, highlight ? 'flash' : '', extendedFlash ? 'extended' : '',
    remaining <= 10 && isOpen ? 'urgent' : ''].join(' ')

  return (
    <article className={cls}>
      <header>
        <span className="lot-id">ล็อต #{lot.id}</span>
        <span className="badges">
          {lot.extensions > 0 && (
            <span className="badge ext" title="จำนวนครั้งที่ต่อเวลาอัตโนมัติ">
              +{lot.extensions}{softClose.max_extensions > 0 ? `/${softClose.max_extensions}` : ''}
            </span>
          )}
          <span className={`badge ${lot.status}`}>
            {lot.status === 'open' ? (isOpen ? `เหลือ ${remaining} วิ` : 'กำลังปิด...')
              : lot.status === 'sold' ? 'ขายแล้ว' : 'ไม่มีผู้เสนอ'}
          </span>
        </span>
      </header>

      {isOpen && (
        <div className="timebar" title={inWindow && canExtend ? 'เสนอราคาตอนนี้จะต่อเวลาอัตโนมัติ' : ''}>
          <div className={`fill ${inWindow ? (canExtend ? 'window' : 'nowindow') : ''}`}
            style={{ width: `${Math.min(100, (remainingMs / (softClose.extend_to_seconds * 1000)) * 100)}%` }} />
        </div>
      )}
      {extendedFlash && <div className="ext-toast">+ ต่อเวลาเป็น {softClose.extend_to_seconds} วิ</div>}

      <h2 title="คลาสที่ความมั่นใจสูงสุดในล็อตนี้">{lot.main_class.replaceAll('_', ' ')}</h2>
      <ul className="dets" title="ผลตรวจทั้งหมดในล็อต">
        {lot.detections.map((d, i) => (
          <li key={i}>
            <span>{d.class.replaceAll('_', ' ')}</span>
            <meter min={0} max={1} value={d.confidence} low={0.5} high={0.8} optimum={1} />
            <span className="conf">{(d.confidence * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <div className="meta">
        กล้อง {lot.device} เวลาตรวจ {fmtTime(lot.detected_at)} ปิด {fmtTime(lot.ends_at)}
        {inWindow && isOpen && (canExtend
          ? <span className="hint ok"> เสนอตอนนี้ต่อเวลา</span>
          : <span className="hint"> {softClose.enabled ? 'ต่อเวลาครบแล้ว' : 'ไม่ต่อเวลา'}</span>)}
      </div>

      <div className="price">
        <div>
          <small>{lot.bid_count === 0 ? 'ราคาเริ่ม' : `ราคาปัจจุบัน (${lot.bid_count} ครั้ง)`}</small>
          <strong>{fmtBaht(lot.current_price)}</strong>
        </div>
        <div className="bidder">
          <small>ผู้เสนอสูงสุด</small>
          <span className={isMine ? 'me' : ''}>{lot.current_bidder ?? '-'}{isMine ? ' (คุณ)' : ''}</span>
        </div>
      </div>

      {isOpen && (
        <form onSubmit={submit} className="bidform">
          <input type="number" min={minBid} step={minIncrement} value={amount}
            onChange={(e) => setAmount(Number(e.target.value))} aria-label="จำนวนเงิน" />
          <button type="button" onClick={() => setAmount(minBid)} title="ตั้งเป็นขั้นต่ำ">ขั้นต่ำ {minBid}</button>
          <button type="submit" className="primary" disabled={busy || !bidder}>
            {bidder ? 'เสนอราคา' : 'ใส่ชื่อก่อน'}
          </button>
          {err && <div className="err">{err}</div>}
        </form>
      )}
    </article>
  )
}

// ---------------------------------------------------------------- SoftCloseBar
function SoftCloseBar({ sc, onChange }: { sc: SoftClose; onChange: (p: Partial<SoftClose>) => void }) {
  const unlimited = sc.max_extensions <= 0
  const [lastMax, setLastMax] = useState(sc.max_extensions > 0 ? sc.max_extensions : 10)
  useEffect(() => { if (sc.max_extensions > 0) setLastMax(sc.max_extensions) }, [sc.max_extensions])

  return (
    <section className={`softclose ${sc.enabled ? 'on' : 'off'}`}>
      <label className="switch" title="เมื่อมีคนเสนอราคาตอนใกล้หมดเวลา ระบบจะเลื่อนเวลาปิดออกไป กันการกดวินาทีสุดท้าย">
        <input type="checkbox" checked={sc.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <span className="slider" />
        <b>ต่อเวลาอัตโนมัติ {sc.enabled ? 'เปิด' : 'ปิด'}</b>
      </label>
      <div className="rule" aria-disabled={!sc.enabled}>
        ถ้าเสนอราคาตอนเหลือน้อยกว่า
        <input type="number" min={1} value={sc.extend_window_seconds} disabled={!sc.enabled}
          onChange={(e) => onChange({ extend_window_seconds: Number(e.target.value) })} /> วิ
        <span className="sep">→</span> ตั้งเวลากลับเป็น
        <input type="number" min={1} value={sc.extend_to_seconds} disabled={!sc.enabled}
          onChange={(e) => onChange({ extend_to_seconds: Number(e.target.value) })} /> วิ
        <span className="sep">|</span> สูงสุด
        <input type="number" min={1} value={unlimited ? lastMax : sc.max_extensions} disabled={!sc.enabled || unlimited}
          onChange={(e) => onChange({ max_extensions: Math.max(1, Number(e.target.value)) })} /> ครั้ง
        <label className="chk">
          <input type="checkbox" checked={unlimited} disabled={!sc.enabled}
            onChange={(e) => onChange({ max_extensions: e.target.checked ? 0 : lastMax })} /> ไม่จำกัด
        </label>
      </div>
      <small className="note">กติกานี้ใช้กับทุกคนและทุกล็อตทันที ค่าเริ่มต้นตอนสตาร์ทอยู่ใน backend/config.json</small>
    </section>
  )
}

// ---------------------------------------------------------------- App
export default function App() {
  const [lots, setLots] = useState<Lot[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [connected, setConnected] = useState(false)
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [bidder, setBidder] = useState(() => localStorage.getItem('bidder') ?? '')
  const [flashId, setFlashId] = useState<number | null>(null)
  const [extendedId, setExtendedId] = useState<number | null>(null)
  const [log, setLog] = useState<string[]>([])
  const now = useNow()
  const flashTimer = useRef<number>(undefined)
  const extTimer = useRef<number>(undefined)

  const pushLog = useCallback((s: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString('th-TH')} ${s}`, ...l].slice(0, 40)), [])

  const upsert = useCallback((lot: Lot) => {
    setLots((prev) => {
      const i = prev.findIndex((l) => l.id === lot.id)
      if (i === -1) return [lot, ...prev]
      const next = prev.slice(); next[i] = lot; return next
    })
    setFlashId(lot.id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 800)
  }, [])

  const markExtended = useCallback((id: number) => {
    setExtendedId(id)
    window.clearTimeout(extTimer.current)
    extTimer.current = window.setTimeout(() => setExtendedId(null), 1500)
  }, [])

  useEffect(() => {
    fetchLots().then(setLots).catch(() => pushLog('โหลดรายการไม่สำเร็จ'))
    fetchSettings().then(setSettings).catch(() => pushLog('โหลดกติกาไม่สำเร็จ ใช้ค่าเริ่มต้น'))
    const onMsg = (m: WsMessage) => {
      switch (m.type) {
        case 'snapshot':
          setLots((prev) => {
            const map = new Map(prev.map((l) => [l.id, l]))
            m.data.forEach((l) => map.set(l.id, l))
            return [...map.values()].sort((a, b) => b.id - a.id)
          })
          break
        case 'settings':
          setSettings(m.data)
          pushLog(`กติกา: ต่อเวลาอัตโนมัติ ${m.data.soft_close.enabled ? 'เปิด' : 'ปิด'}`)
          break
        case 'lot_created':
          upsert(m.data); pushLog(`ล็อต #${m.data.id} ${m.data.main_class} เข้าประมูล เริ่ม ${m.data.start_price}`); break
        case 'bid':
          upsert(m.data); pushLog(`ล็อต #${m.data.id} ${m.data.current_bidder} เสนอ ${m.data.current_price}`); break
        case 'lot_extended':
          upsert(m.data); markExtended(m.data.id)
          pushLog(`ล็อต #${m.data.id} ต่อเวลาครั้งที่ ${m.data.extensions} ปิด ${fmtTime(m.data.ends_at)}`); break
        case 'lot_closed':
          upsert(m.data)
          pushLog(m.data.status === 'sold'
            ? `ล็อต #${m.data.id} ขายให้ ${m.data.current_bidder} ที่ ${m.data.current_price}`
            : `ล็อต #${m.data.id} ปิดโดยไม่มีผู้เสนอ`)
          break
      }
    }
    return connectWs(onMsg, setConnected)
  }, [upsert, pushLog, markExtended])

  useEffect(() => { localStorage.setItem('bidder', bidder) }, [bidder])

  const onBid = useCallback(async (lotId: number, amount: number) => {
    const lot = await placeBid(lotId, bidder.trim(), amount)
    upsert(lot)
    if (lot.extended) markExtended(lot.id)
  }, [bidder, upsert, markExtended])

  const onSoftClose = useCallback((patch: Partial<SoftClose>) => {
    // optimistic: อัปเดตจอทันที แล้วให้ค่าจริงจาก server (WS "settings") มาทับ
    setSettings((s) => ({ ...s, soft_close: { ...s.soft_close, ...patch } }))
    updateSoftClose(patch).catch((e) => pushLog(`บันทึกกติกาไม่สำเร็จ: ${(e as Error).message}`))
  }, [pushLog])

  const shown = useMemo(() => {
    const list = lots.filter((l) => (tab === 'open' ? l.status === 'open' : l.status !== 'open'))
    // แท็บกำลังประมูล: ล็อตที่ใกล้ปิดที่สุดอยู่บนสุด จะได้ไม่พลาดตอนต่อเวลา
    return tab === 'open' ? list.sort((a, b) => a.ends_at.localeCompare(b.ends_at)) : list
  }, [lots, tab])
  const openCount = lots.filter((l) => l.status === 'open').length

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>ประมูลเมล็ดกาแฟ</h1>
          <small>ล็อตถูกสร้างอัตโนมัติจากผลตรวจ AI เปิดประมูล {settings.duration_seconds} วิ ขั้นต่ำเพิ่ม {settings.min_increment} บาท</small>
        </div>
        <label className="name">
          ชื่อผู้เสนอราคา
          <input value={bidder} onChange={(e) => setBidder(e.target.value)} placeholder="เช่น สมชาย" maxLength={40} />
        </label>
        <span className={`conn ${connected ? 'on' : 'off'}`} title="สถานะเชื่อมต่อ real-time">
          {connected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ...'}
        </span>
      </header>

      <SoftCloseBar sc={settings.soft_close} onChange={onSoftClose} />

      <nav className="tabs">
        <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>กำลังประมูล ({openCount})</button>
        <button className={tab === 'closed' ? 'active' : ''} onClick={() => setTab('closed')}>ปิดแล้ว ({lots.length - openCount})</button>
      </nav>

      <main className="grid">
        {shown.length === 0 && (
          <p className="empty">{tab === 'open' ? 'ยังไม่มีล็อตเปิดประมูล รอผลตรวจจากกล้อง...' : 'ยังไม่มีล็อตที่ปิดแล้ว'}</p>
        )}
        {shown.map((lot) => (
          <LotCard key={lot.id} lot={lot} bidder={bidder.trim()} now={now}
            minIncrement={settings.min_increment} softClose={settings.soft_close}
            onBid={onBid} highlight={flashId === lot.id} extendedFlash={extendedId === lot.id} />
        ))}
      </main>

      <aside className="log">
        <h3>เหตุการณ์ล่าสุด</h3>
        <ul>{log.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </aside>
    </div>
  )
}
