import { useEffect, useState } from 'react'
import type { Lot, Settings } from '../api'
import { CountdownRing } from './CountdownRing'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const fmtBaht = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
const nice = (s: string) => s.replaceAll('_', ' ')

export function LotCard({ lot, bidder, now, settings, onBid, highlight, extendedFlash, index }: {
  lot: Lot; bidder: string; now: number; settings: Settings
  highlight: boolean; extendedFlash: boolean; index: number
  onBid: (lotId: number, amount: number) => Promise<void>
}) {
  const sc = settings.soft_close
  const remainingMs = new Date(lot.ends_at).getTime() - now
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000))
  const isOpen = lot.status === 'open' && remaining > 0
  const minBid = lot.bid_count === 0 ? lot.start_price : lot.current_price + settings.min_increment
  const [amount, setAmount] = useState(minBid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isMine = bidder !== '' && lot.current_bidder === bidder
  const canExtend = sc.enabled && (sc.max_extensions <= 0 || lot.extensions < sc.max_extensions)
  const inWindow = isOpen && remainingMs < sc.extend_window_seconds * 1000
  const ringState = !isOpen ? 'closed' : inWindow ? (canExtend ? 'window' : 'nowindow') : 'normal'
  // วงแหวนเต็ม = ระยะเวลาประมูลปกติ หรือถ้าถูกต่อเวลาแล้วใช้ extend_to เป็นฐาน
  const totalMs = (lot.extensions > 0 ? sc.extend_to_seconds : settings.duration_seconds) * 1000

  useEffect(() => { setAmount((a) => (a < minBid ? minBid : a)) }, [minBid])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try { await onBid(lot.id, amount) } catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
  }

  const cls = ['lot', lot.status, highlight ? 'flash' : '', extendedFlash ? 'extended' : '',
    isOpen && remaining <= 10 ? 'urgent' : '', isMine ? 'mine' : ''].join(' ')

  return (
    <article className={cls} style={{ '--i': index } as React.CSSProperties}>
      <header className="lot-head">
        <div>
          <span className="lot-id">ล็อต #{lot.id}</span>
          <h2 title="คลาสที่ความมั่นใจสูงสุดในล็อตนี้">{nice(lot.main_class)}</h2>
          <div className="meta">กล้อง {lot.device} · ตรวจ {fmtTime(lot.detected_at)} · ปิด {fmtTime(lot.ends_at)}</div>
        </div>
        <CountdownRing remainingMs={isOpen ? remainingMs : 0} totalMs={totalMs} state={ringState} />
      </header>

      <div className="chips">
        <span className={`chip ${lot.status}`}>
          {lot.status === 'open' ? (isOpen ? 'กำลังประมูล' : 'กำลังปิด…') : lot.status === 'sold' ? 'ขายแล้ว' : 'ไม่มีผู้เสนอ'}
        </span>
        {lot.extensions > 0 && (
          <span className="chip ext" title="จำนวนครั้งที่ต่อเวลาอัตโนมัติ">
            ต่อเวลา +{lot.extensions}{sc.max_extensions > 0 ? `/${sc.max_extensions}` : ''}
          </span>
        )}
        {inWindow && (canExtend
          ? <span className="chip hint-ok">เสนอตอนนี้ต่อเวลาเป็น {sc.extend_to_seconds} วิ</span>
          : <span className="chip hint">{sc.enabled ? 'ต่อเวลาครบแล้ว' : 'ไม่ต่อเวลา'}</span>)}
      </div>
      {extendedFlash && <div className="ext-toast">⏱ ต่อเวลา +{sc.extend_to_seconds} วิ</div>}

      <ul className="dets" title="ผลตรวจทั้งหมดในล็อต">
        {lot.detections.map((d, i) => (
          <li key={i}>
            <span className="det-name">{nice(d.class)}</span>
            <span className="det-bar"><span style={{ width: `${d.confidence * 100}%` }} /></span>
            <span className="det-conf">{(d.confidence * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>

      <div className="price">
        <div>
          <small>{lot.bid_count === 0 ? 'ราคาเริ่ม' : `ราคาปัจจุบัน · ${lot.bid_count} ครั้ง`}</small>
          <strong key={lot.current_price} className="price-num">{fmtBaht(lot.current_price)} <span>บาท</span></strong>
        </div>
        <div className="bidder">
          <small>ผู้เสนอสูงสุด</small>
          <span className={isMine ? 'me' : ''}>{lot.current_bidder ?? '—'}{isMine ? ' (คุณ)' : ''}</span>
        </div>
      </div>

      {isOpen && (
        <form onSubmit={submit} className="bidform">
          <input type="number" inputMode="numeric" min={minBid} step={settings.min_increment} value={amount}
            onChange={(e) => setAmount(Number(e.target.value))} aria-label="จำนวนเงิน" />
          <button type="button" className="ghost" onClick={() => setAmount(minBid)} title="ตั้งเป็นราคาขั้นต่ำ">ขั้นต่ำ {fmtBaht(minBid)}</button>
          <button type="submit" className="primary" disabled={busy || !bidder}>
            {busy ? <span className="spinner" aria-hidden /> : null}{bidder ? 'เสนอราคา' : 'ใส่ชื่อก่อน'}
          </button>
          {err && <div className="err">{err}</div>}
        </form>
      )}
      {lot.status === 'sold' && <div className="sold-banner">ขายให้ <b>{lot.current_bidder}</b> ที่ {fmtBaht(lot.current_price)} บาท</div>}
    </article>
  )
}
