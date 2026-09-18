import { useEffect, useMemo, useState } from 'react'
import type { Lot } from '../api'
import { LotCard, fmtBaht } from '../components/LotCard'
import { useToast } from '../components/Toasts'
import type { useAuction } from '../hooks/useAuction'

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

/** หน้าแรก: การ์ดสรุปทุกล็อต (คลาส ราคาปัจจุบัน ผู้นำ เวลา) กดการ์ดเพื่อเข้าไปเสนอราคา */
export function AuctionPage({ auction, bidder, setBidder }: {
  auction: ReturnType<typeof useAuction>; bidder: string; setBidder: (v: string) => void
}) {
  const { lots, settings, events, flashId, extendedId } = auction
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const me = bidder.trim()

  // toast เฉพาะเหตุการณ์ที่เกี่ยวกับ "ฉัน" (ถูกแซง / ชนะ) ไม่รบกวนด้วยของคนอื่น
  const lastSeen = useState({ id: 0 })[0]
  useEffect(() => {
    const fresh = events.filter((e) => e.id > lastSeen.id)
    if (events.length) lastSeen.id = events[0].id
    for (const e of fresh) {
      if (e.kind === 'bid' && e.prevBidder === me && e.bidder !== me) toast(`คุณถูกแซงในล็อต #${e.lotId} ราคา ${fmtBaht(e.price ?? 0)} บาท`, 'warn')
      if (e.kind === 'close' && e.status === 'sold' && e.bidder === me) toast(`คุณชนะล็อต #${e.lotId} ที่ ${fmtBaht(e.price ?? 0)} บาท`, 'success')
    }
  }, [events, me, toast, lastSeen])

  const open = useMemo(() => lots.filter((l) => l.status === 'open').sort((a, b) => a.ends_at.localeCompare(b.ends_at)), [lots])
  const closed = useMemo(() => lots.filter((l) => l.status !== 'open'), [lots])
  const shown: Lot[] = tab === 'open' ? open : closed
  const myWins = useMemo(() => closed.filter((l) => l.status === 'sold' && me && l.current_bidder === me), [closed, me])
  const myLeading = useMemo(() => open.filter((l) => me && l.current_bidder === me).length, [open, me])

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1>ล็อตจากผลตรวจ AI <span className="grad">เข้าประมูลทันที</span></h1>
          <p>ทุกล็อตเปิด {settings.duration_seconds} วิ · เพิ่มขั้นต่ำ {settings.min_increment} บาท ·
            ต่อเวลาอัตโนมัติ <b className={settings.soft_close.enabled ? 'on' : 'off'}>{settings.soft_close.enabled ? 'เปิด' : 'ปิด'}</b>
            {settings.soft_close.enabled && ` (เหลือ < ${settings.soft_close.extend_window_seconds} วิ แล้วมีคนเสนอ → กลับเป็น ${settings.soft_close.extend_to_seconds} วิ)`}
            <br />กดการ์ดเพื่อดูรายละเอียดและเสนอราคา</p>
        </div>
        <div className="stats">
          <div className="stat"><b>{open.length}</b><small>กำลังประมูล</small></div>
          <div className="stat"><b>{myLeading}</b><small>คุณนำอยู่</small></div>
          <div className="stat"><b>{myWins.length}</b><small>คุณชนะ</small></div>
        </div>
      </section>

      <section className="toolbar">
        <label className="field">
          <span>ชื่อผู้เสนอราคา</span>
          <input value={bidder} onChange={(e) => setBidder(e.target.value)} placeholder="เช่น สมชาย" maxLength={40}
            autoComplete="nickname" enterKeyHint="done" />
        </label>
        <nav className="tabs" aria-label="กรองล็อต">
          <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>กำลังประมูล <b>{open.length}</b></button>
          <button className={tab === 'closed' ? 'active' : ''} onClick={() => setTab('closed')}>ปิดแล้ว <b>{closed.length}</b></button>
        </nav>
      </section>

      <main className="grid wide" aria-live="polite">
        {shown.length === 0 && (
          <div className="empty">
            <div className="empty-art" aria-hidden>☕</div>
            <p>{tab === 'open' ? 'ยังไม่มีล็อตเปิดประมูล รอผลตรวจจากกล้อง…' : 'ยังไม่มีล็อตที่ปิดแล้ว'}</p>
          </div>
        )}
        {shown.map((lot, i) => (
          <LotCard key={lot.id} lot={lot} bidder={me} now={now} settings={settings} index={i}
            highlight={flashId === lot.id} extendedFlash={extendedId === lot.id} />
        ))}
      </main>
    </>
  )
}
