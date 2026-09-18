import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLot, type Bid } from '../api'
import { CountdownRing } from '../components/CountdownRing'
import { BidForm, OriginChip, StatusChip, fmtBaht, fmtTime, lotTiming, nice } from '../components/LotCard'
import { useToast } from '../components/Toasts'
import type { useAuction } from '../hooks/useAuction'

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

/** หน้าล็อตเดียว: รายละเอียดผลตรวจ เสนอราคา และเหตุการณ์เฉพาะล็อตนี้ */
export function LotPage({ lotId, auction, bidder, setBidder }: {
  lotId: number; auction: ReturnType<typeof useAuction>; bidder: string; setBidder: (v: string) => void
}) {
  const { lots, settings, events, bid, extendedId, flashId } = auction
  const toast = useToast()
  const now = useNow()
  const lot = lots.find((l) => l.id === lotId)
  const me = bidder.trim()
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [notFound, setNotFound] = useState(false)

  // ประวัติเสนอราคาจาก server: โหลดครั้งแรก และโหลดใหม่เมื่อจำนวนครั้งเปลี่ยน (มี bid ใหม่ผ่าน WS)
  useEffect(() => {
    let alive = true
    fetchLot(lotId).then((l) => { if (alive) setBids(l.bids) }).catch(() => { if (alive) setNotFound(true) })
    return () => { alive = false }
  }, [lotId, lot?.bid_count])

  const lotEvents = useMemo(() => events.filter((e) => e.lotId === lotId && (e.kind === 'extend' || e.kind === 'close' || e.kind === 'lot')), [events, lotId])

  const onBid = useCallback(async (id: number, amount: number) => {
    const r = await bid(id, me, amount)
    toast(r.extended ? `เสนอ ${fmtBaht(amount)} บาท สำเร็จ และต่อเวลาแล้ว` : `เสนอ ${fmtBaht(amount)} บาท สำเร็จ คุณเป็นผู้นำ`, 'success')
  }, [bid, me, toast])

  if (!lot) {
    return (
      <div className="lotpage">
        <a className="back" href="#/">← กลับหน้าแรก</a>
        <div className="empty"><div className="empty-art" aria-hidden>☕</div><p>{notFound ? `ไม่พบล็อต #${lotId} (อาจถูกลบไปแล้ว)` : 'กำลังโหลด…'}</p></div>
      </div>
    )
  }

  const t = lotTiming(lot, now, settings)
  const sc = settings.soft_close
  const isMine = me !== '' && lot.current_bidder === me
  const iBidHere = me !== '' && (bids ?? []).some((b) => b.bidder === me)
  const cls = ['lotpage', flashId === lot.id ? 'flash' : '', extendedId === lot.id ? 'extended' : ''].join(' ')

  return (
    <div className={cls}>
      <a className="back" href="#/">← กลับหน้าแรก</a>

      <section className="lot-hero">
        <div>
          <span className="lot-id">ล็อต #{lot.id}</span>
          <h1>{nice(lot.main_class)}</h1>
          <div className="meta">กล้อง {lot.device} · ตรวจ {fmtTime(lot.detected_at)} · ปิด {fmtTime(lot.ends_at)}</div>
          <div className="chips">
            <OriginChip lot={lot} detailed />
            <StatusChip lot={lot} isOpen={t.isOpen} />
            {lot.extensions > 0 && <span className="chip ext">ต่อเวลา +{lot.extensions}{sc.max_extensions > 0 ? `/${sc.max_extensions}` : ''}</span>}
            {t.inWindow && (t.canExtend
              ? <span className="chip hint-ok">เสนอตอนนี้ต่อเวลาเป็น {sc.extend_to_seconds} วิ</span>
              : <span className="chip hint">{sc.enabled ? 'ต่อเวลาครบแล้ว' : 'ไม่ต่อเวลา'}</span>)}
            {isMine && t.isOpen && <span className="chip mine-chip">คุณนำอยู่</span>}
            {!isMine && iBidHere && t.isOpen && <span className="chip bad-chip">คุณถูกแซง</span>}
          </div>
          {extendedId === lot.id && <div className="ext-toast">⏱ ต่อเวลา +{sc.extend_to_seconds} วิ</div>}
        </div>
        <CountdownRing remainingMs={t.isOpen ? t.remainingMs : 0} totalMs={t.totalMs} state={t.ringState} size={112} />
      </section>

      <div className="lot-grid">
        <section className="panel" style={{ '--i': 0 } as React.CSSProperties}>
          <h2>ผลตรวจ AI ในล็อตนี้</h2>
          <ul className="dets">
            {lot.detections.map((d, i) => (
              <li key={i}>
                <span className="det-name">{nice(d.class)}{d.track_id !== null && <small className="muted"> #{d.track_id}</small>}</span>
                <span className="det-bar"><span style={{ width: `${d.confidence * 100}%` }} /></span>
                <span className="det-conf">{(d.confidence * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <p className="muted tiny">ราคาเริ่มคิดจากคลาสที่ความมั่นใจสูงสุด ({nice(lot.main_class)}) = {fmtBaht(lot.start_price)} บาท</p>
        </section>

        <section className="panel bidpanel" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="price">
            <div>
              <small>{lot.bid_count === 0 ? 'ราคาเริ่ม' : `ราคาปัจจุบัน · ${lot.bid_count} ครั้ง`}</small>
              <strong key={lot.current_price} className="price-num xl">{fmtBaht(lot.current_price)} <span>บาท</span></strong>
            </div>
            <div className="bidder">
              <small>ผู้เสนอสูงสุด</small>
              <span className={isMine ? 'me' : ''}>{lot.current_bidder ?? '—'}{isMine ? ' (คุณ)' : ''}</span>
            </div>
          </div>

          {t.isOpen ? (
            <>
              <label className="field">
                <span>ชื่อผู้เสนอราคา</span>
                <input value={bidder} onChange={(e) => setBidder(e.target.value)} placeholder="เช่น สมชาย" maxLength={40} autoComplete="nickname" />
              </label>
              <BidForm lot={lot} bidder={me} minBid={t.minBid} minIncrement={settings.min_increment} onBid={onBid} />
              <p className="muted tiny">ขั้นต่ำ {fmtBaht(t.minBid)} บาท (เพิ่มครั้งละ {settings.min_increment})
                {sc.enabled && ` · เสนอตอนเหลือ < ${sc.extend_window_seconds} วิ จะต่อเวลาเป็น ${sc.extend_to_seconds} วิ`}</p>
            </>
          ) : (
            <div className={`closed-banner ${lot.status}`}>
              {lot.status === 'sold'
                ? <>ขายแล้วให้ <b>{lot.current_bidder}</b> ที่ {fmtBaht(lot.current_price)} บาท{isMine && ' 🎉 คุณคือผู้ชนะ'}</>
                : 'ปิดโดยไม่มีผู้เสนอราคา'}
            </div>
          )}
        </section>

        <section className="panel history" style={{ '--i': 2 } as React.CSSProperties}>
          <h2>เหตุการณ์ของล็อตนี้</h2>
          {bids === null && <p className="muted"><span className="spinner" aria-hidden /> กำลังโหลด…</p>}
          {bids !== null && bids.length === 0 && lotEvents.length === 0 && <p className="muted">ยังไม่มีใครเสนอราคา เป็นคนแรกได้เลย</p>}
          <ol className="timeline">
            {lotEvents.filter((e) => e.kind !== 'lot').map((e) => (
              <li key={`e${e.id}`} className={e.kind}><time>{e.time}</time><span>{e.text.replace(`ล็อต #${lot.id} `, '')}</span></li>
            ))}
            {(bids ?? []).map((b, i) => {
              const mine = me !== '' && b.bidder === me
              const top = i === 0 && lot.status !== 'unsold'
              return (
                <li key={b.id} className={`bid ${mine ? 'good' : ''} ${top ? 'top' : ''}`}>
                  <time>{fmtTime(b.created_at)}</time>
                  <span><b>{b.bidder}</b>{mine && ' (คุณ)'} เสนอ {fmtBaht(b.amount)} บาท{top && lot.status === 'open' ? ' · นำอยู่' : ''}{top && lot.status === 'sold' ? ' · ชนะ' : ''}</span>
                </li>
              )
            })}
            <li className="lot"><time>{fmtTime(lot.created_at)}</time><span>เข้าประมูล ราคาเริ่ม {fmtBaht(lot.start_price)} บาท</span></li>
          </ol>
        </section>
      </div>
    </div>
  )
}
