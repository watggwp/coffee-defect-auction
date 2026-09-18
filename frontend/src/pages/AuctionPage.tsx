import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Lot } from '../api'
import { LotCard, fmtBaht } from '../components/LotCard'
import { useToast } from '../components/Toasts'
import type { AuctionEvent, useAuction } from '../hooks/useAuction'

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

/** แปลงเหตุการณ์ให้เป็นมุมมองของ "ฉัน" คืน null ถ้าไม่เกี่ยวกับฉัน */
export function personalText(e: AuctionEvent, me: string): { text: string; tone: 'good' | 'bad' | 'neutral' } | null {
  if (!me) return null
  const lot = e.lotId !== undefined ? `ล็อต #${e.lotId}${e.lotClass ? ` ${e.lotClass}` : ''}` : ''
  switch (e.kind) {
    case 'bid':
      if (e.bidder === me) return { text: `คุณเสนอ ${fmtBaht(e.price ?? 0)} บาท ใน${lot} และเป็นผู้นำอยู่`, tone: 'good' }
      if (e.prevBidder === me) return { text: `คุณถูกแซงใน${lot} โดย ${e.bidder} ที่ ${fmtBaht(e.price ?? 0)} บาท`, tone: 'bad' }
      return null
    case 'extend':
      if (e.bidder === me) return { text: `${lot} ที่คุณนำอยู่ถูกต่อเวลา`, tone: 'neutral' }
      return null
    case 'close':
      if (e.bidder === me && e.status === 'sold') return { text: `คุณชนะ${lot} ที่ ${fmtBaht(e.price ?? 0)} บาท`, tone: 'good' }
      return null
    case 'reset':
    case 'error':
      return { text: e.text, tone: 'neutral' }
    default:
      return null
  }
}

export function AuctionPage({ auction }: { auction: ReturnType<typeof useAuction> }) {
  const { lots, settings, events, flashId, extendedId, bid } = auction
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [feedMode, setFeedMode] = useState<'mine' | 'all'>(() => { try { return (localStorage.getItem('feed_mode') as 'mine' | 'all') || 'mine' } catch { return 'mine' } })
  const [bidder, setBidder] = useState(() => { try { return localStorage.getItem('bidder') ?? '' } catch { return '' } })
  useEffect(() => { try { localStorage.setItem('bidder', bidder) } catch { /* ignore */ } }, [bidder])
  useEffect(() => { try { localStorage.setItem('feed_mode', feedMode) } catch { /* ignore */ } }, [feedMode])
  const me = bidder.trim()

  const onBid = useCallback(async (lotId: number, amount: number) => {
    const lot = await bid(lotId, me, amount)
    toast(lot.extended ? `เสนอ ${fmtBaht(amount)} บาท สำเร็จ และต่อเวลาแล้ว` : `เสนอ ${fmtBaht(amount)} บาท สำเร็จ`, 'success')
  }, [bid, me, toast])

  // แจ้ง toast เมื่อ "ฉัน" ถูกแซง หรือชนะ (เหตุการณ์ของคนอื่นไม่รบกวน)
  const lastSeen = useState({ id: 0 })[0]
  useEffect(() => {
    const fresh = events.filter((e) => e.id > lastSeen.id)
    if (fresh.length) lastSeen.id = events[0].id
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

  const feed = useMemo(() => {
    if (feedMode === 'all') return events.map((e) => ({ e, text: e.text, tone: 'neutral' as const }))
    return events.flatMap((e) => { const p = personalText(e, me); return p ? [{ e, ...p }] : [] })
  }, [events, feedMode, me])

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

      <div className="content">
        <main className="grid" aria-live="polite">
          {shown.length === 0 && (
            <div className="empty">
              <div className="empty-art" aria-hidden>☕</div>
              <p>{tab === 'open' ? 'ยังไม่มีล็อตเปิดประมูล รอผลตรวจจากกล้อง…' : 'ยังไม่มีล็อตที่ปิดแล้ว'}</p>
            </div>
          )}
          {shown.map((lot, i) => (
            <LotCard key={lot.id} lot={lot} bidder={me} now={now} settings={settings} index={i}
              onBid={onBid} highlight={flashId === lot.id} extendedFlash={extendedId === lot.id} />
          ))}
        </main>

        <aside className="feed">
          <div className="feed-head">
            <h3>{feedMode === 'mine' ? 'เหตุการณ์ของคุณ' : 'เหตุการณ์ทั้งหมด'}</h3>
            <div className="seg" role="tablist" aria-label="โหมดเหตุการณ์">
              <button role="tab" aria-selected={feedMode === 'mine'} className={feedMode === 'mine' ? 'active' : ''} onClick={() => setFeedMode('mine')}>ของฉัน</button>
              <button role="tab" aria-selected={feedMode === 'all'} className={feedMode === 'all' ? 'active' : ''} onClick={() => setFeedMode('all')}>ทั้งหมด</button>
            </div>
          </div>
          {feedMode === 'mine' && !me && <p className="muted">ใส่ชื่อผู้เสนอราคาก่อน ระบบจะแสดงเฉพาะเหตุการณ์ที่เกี่ยวกับคุณ เช่น เสนอราคา ถูกแซง ชนะ</p>}
          {feedMode === 'mine' && me && feed.length === 0 && <p className="muted">ยังไม่มีเหตุการณ์ของคุณ ลองเสนอราคาสักล็อต</p>}
          {feedMode === 'all' && feed.length === 0 && <p className="muted">ยังไม่มีเหตุการณ์</p>}
          <ul>
            {feed.map(({ e, text, tone }) => (
              <li key={e.id} className={`${e.kind} ${tone}`}><time>{e.time}</time><span>{text}</span></li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  )
}
