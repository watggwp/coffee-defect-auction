import { useEffect, useState } from 'react'
import type { Lot, Settings } from '../api'
import { CountdownRing } from './CountdownRing'

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const fmtBaht = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
export const nice = (s: string) => s.replaceAll('_', ' ')

/** คำนวณสถานะเวลา/ต่อเวลาของล็อต ใช้ร่วมกันทั้งการ์ดย่อและหน้าล็อต */
export function lotTiming(lot: Lot, now: number, settings: Settings) {
  const sc = settings.soft_close
  const remainingMs = new Date(lot.ends_at).getTime() - now
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000))
  const isOpen = lot.status === 'open' && remaining > 0
  const canExtend = sc.enabled && (sc.max_extensions <= 0 || lot.extensions < sc.max_extensions)
  const inWindow = isOpen && remainingMs < sc.extend_window_seconds * 1000
  const ringState = (!isOpen ? 'closed' : inWindow ? (canExtend ? 'window' : 'nowindow') : 'normal') as 'closed' | 'window' | 'nowindow' | 'normal'
  const totalMs = (lot.extensions > 0 ? sc.extend_to_seconds : settings.duration_seconds) * 1000
  const minBid = lot.bid_count === 0 ? lot.start_price : lot.current_price + settings.min_increment
  return { remainingMs, remaining, isOpen, canExtend, inWindow, ringState, totalMs, minBid }
}

export function StatusChip({ lot, isOpen }: { lot: Lot; isOpen: boolean }) {
  return (
    <span className={`chip ${lot.status}`}>
      {lot.status === 'open' ? (isOpen ? 'กำลังประมูล' : 'กำลังปิด…') : lot.status === 'sold' ? 'ขายแล้ว' : 'ไม่มีผู้เสนอ'}
    </span>
  )
}

/** การ์ดสรุปในหน้าแรก: กดเพื่อเข้าหน้าล็อต */
export function LotCard({ lot, bidder, now, settings, highlight, extendedFlash, index }: {
  lot: Lot; bidder: string; now: number; settings: Settings
  highlight: boolean; extendedFlash: boolean; index: number
}) {
  const t = lotTiming(lot, now, settings)
  const isMine = bidder !== '' && lot.current_bidder === bidder
  const cls = ['lot', 'compact', lot.status, highlight ? 'flash' : '', extendedFlash ? 'extended' : '',
    t.isOpen && t.remaining <= 10 ? 'urgent' : '', isMine ? 'mine' : ''].join(' ')

  return (
    <a className={cls} href={`#/lot/${lot.id}`} style={{ '--i': index } as React.CSSProperties} aria-label={`เปิดล็อต #${lot.id} ${nice(lot.main_class)}`}>
      <header className="lot-head">
        <div>
          <span className="lot-id">ล็อต #{lot.id}</span>
          <h2>{nice(lot.main_class)}</h2>
          <div className="meta">{lot.detections.length} รายการ · กล้อง {lot.device} · ปิด {fmtTime(lot.ends_at)}</div>
        </div>
        <CountdownRing remainingMs={t.isOpen ? t.remainingMs : 0} totalMs={t.totalMs} state={t.ringState} size={56} />
      </header>

      <div className="chips">
        <StatusChip lot={lot} isOpen={t.isOpen} />
        {lot.extensions > 0 && <span className="chip ext">ต่อเวลา +{lot.extensions}</span>}
        {t.inWindow && t.canExtend && <span className="chip hint-ok">เสนอตอนนี้ต่อเวลา</span>}
        {isMine && t.isOpen && <span className="chip mine-chip">คุณนำอยู่</span>}
      </div>
      {extendedFlash && <div className="ext-toast">⏱ ต่อเวลา +{settings.soft_close.extend_to_seconds} วิ</div>}

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

      <div className="card-cta">{t.isOpen ? 'เข้าไปเสนอราคา →' : 'ดูรายละเอียด →'}</div>
    </a>
  )
}

/** ฟอร์มเสนอราคา ใช้ในหน้าล็อต */
export function BidForm({ lot, bidder, minBid, minIncrement, onBid }: {
  lot: Lot; bidder: string; minBid: number; minIncrement: number
  onBid: (lotId: number, amount: number) => Promise<void>
}) {
  const [amount, setAmount] = useState(minBid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setAmount((a) => (a < minBid ? minBid : a)) }, [minBid])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try { await onBid(lot.id, amount) } catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
  }
  const quick = [minBid, minBid + minIncrement, minBid + minIncrement * 4]
  return (
    <form onSubmit={submit} className="bidform big-form">
      <div className="quick">
        {quick.map((q) => (
          <button key={q} type="button" className={`ghost ${amount === q ? 'active' : ''}`} onClick={() => setAmount(q)}>{fmtBaht(q)}</button>
        ))}
      </div>
      <input type="number" inputMode="numeric" min={minBid} step={minIncrement} value={amount}
        onChange={(e) => setAmount(Number(e.target.value))} aria-label="จำนวนเงิน" />
      <button type="submit" className="primary" disabled={busy || !bidder}>
        {busy ? <span className="spinner" aria-hidden /> : null}{bidder ? `เสนอ ${fmtBaht(amount)} บาท` : 'ใส่ชื่อก่อน'}
      </button>
      {err && <div className="err">{err}</div>}
    </form>
  )
}
