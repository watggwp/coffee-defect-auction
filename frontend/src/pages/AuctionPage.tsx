import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Lot } from '../api'
import { LotCard, fmtBaht } from '../components/LotCard'
import { useToast } from '../components/Toasts'
import type { useAuction } from '../hooks/useAuction'

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

export function AuctionPage({ auction }: { auction: ReturnType<typeof useAuction> }) {
  const { lots, settings, events, flashId, extendedId, bid } = auction
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [bidder, setBidder] = useState(() => { try { return localStorage.getItem('bidder') ?? '' } catch { return '' } })
  useEffect(() => { try { localStorage.setItem('bidder', bidder) } catch { /* ignore */ } }, [bidder])

  const onBid = useCallback(async (lotId: number, amount: number) => {
    const lot = await bid(lotId, bidder.trim(), amount)
    toast(lot.extended ? `เสนอ ${fmtBaht(amount)} บาท สำเร็จ และต่อเวลาแล้ว` : `เสนอ ${fmtBaht(amount)} บาท สำเร็จ`, 'success')
  }, [bid, bidder, toast])

  const open = useMemo(() => lots.filter((l) => l.status === 'open').sort((a, b) => a.ends_at.localeCompare(b.ends_at)), [lots])
  const closed = useMemo(() => lots.filter((l) => l.status !== 'open'), [lots])
  const shown: Lot[] = tab === 'open' ? open : closed
  const myWins = useMemo(() => closed.filter((l) => l.status === 'sold' && l.current_bidder === bidder.trim() && bidder.trim()), [closed, bidder])

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1>ล็อตจากผลตรวจ AI <span className="grad">เข้าประมูลทันที</span></h1>
          <p>ทุกล็อตเปิด {settings.duration_seconds} วิ · เพิ่มขั้นต่ำ {settings.min_increment} บาท ·
            ต่อเวลาอัตโนมัติ <b className={settings.soft_close.enabled ? 'on' : 'off'}>{settings.soft_close.enabled ? 'เปิด' : 'ปิด'}</b>
            {settings.soft_close.enabled && ` (เหลือ < ${settings.soft_close.extend_window_seconds} วิ แล้วมีคนเสนอ → กลับเป็น ${settings.soft_close.extend_to_seconds} วิ)`}
          </p>
        </div>
        <div className="stats">
          <div className="stat"><b>{open.length}</b><small>กำลังประมูล</small></div>
          <div className="stat"><b>{closed.filter((l) => l.status === 'sold').length}</b><small>ขายแล้ว</small></div>
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

      <div className="content">
        <main className="grid" aria-live="polite">
          {shown.length === 0 && (
            <div className="empty">
              <div className="empty-art" aria-hidden>☕</div>
              <p>{tab === 'open' ? 'ยังไม่มีล็อตเปิดประมูล รอผลตรวจจากกล้อง…' : 'ยังไม่มีล็อตที่ปิดแล้ว'}</p>
            </div>
          )}
          {shown.map((lot, i) => (
            <LotCard key={lot.id} lot={lot} bidder={bidder.trim()} now={now} settings={settings} index={i}
              onBid={onBid} highlight={flashId === lot.id} extendedFlash={extendedId === lot.id} />
          ))}
        </main>

        <aside className="feed">
          <h3>เหตุการณ์ล่าสุด</h3>
          {events.length === 0 && <p className="muted">ยังไม่มีเหตุการณ์</p>}
          <ul>
            {events.map((e) => (
              <li key={e.id} className={e.kind}><time>{e.time}</time><span>{e.text}</span></li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  )
}
