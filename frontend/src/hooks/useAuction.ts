import { useCallback, useEffect, useRef, useState } from 'react'
import { connectWs, fetchLots, fetchSettings, placeBid, type Lot, type Settings, type WsMessage } from '../api'

export const DEFAULT_SETTINGS: Settings = {
  duration_seconds: 60,
  min_increment: 10,
  soft_close: { enabled: true, extend_window_seconds: 10, extend_to_seconds: 10, max_extensions: 10 },
}

export interface AuctionEvent {
  id: number
  time: string
  text: string
  kind: 'lot' | 'bid' | 'extend' | 'close' | 'settings' | 'reset' | 'error'
  lotId?: number
  lotClass?: string
  price?: number
  bidder?: string | null      // ผู้เสนอสูงสุดหลังเหตุการณ์
  prevBidder?: string | null  // ผู้เสนอสูงสุดก่อนเหตุการณ์ (ใช้หาว่าใครถูกแซง)
  status?: Lot['status']
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const nice = (s: string) => s.replaceAll('_', ' ')

/** สถานะประมูลทั้งหมด + WebSocket real-time ใช้ร่วมกันได้ทุกหน้า */
export function useAuction(onEvent?: (e: AuctionEvent) => void) {
  const [lots, setLots] = useState<Lot[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<AuctionEvent[]>([])
  const [flashId, setFlashId] = useState<number | null>(null)
  const [extendedId, setExtendedId] = useState<number | null>(null)
  const timers = useRef<{ flash?: number; ext?: number }>({})
  const seq = useRef(0)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS)
  useEffect(() => { settingsRef.current = settings }, [settings])
  const lotsRef = useRef<Lot[]>([])
  useEffect(() => { lotsRef.current = lots }, [lots])

  const log = useCallback((text: string, kind: AuctionEvent['kind'], extra: Partial<AuctionEvent> = {}) => {
    const e: AuctionEvent = { id: ++seq.current, time: new Date().toLocaleTimeString('th-TH'), text, kind, ...extra }
    setEvents((l) => [e, ...l].slice(0, 80))
    onEventRef.current?.(e)
  }, [])

  const upsert = useCallback((lot: Lot, flash = true) => {
    setLots((prev) => {
      const i = prev.findIndex((l) => l.id === lot.id)
      if (i === -1) return [lot, ...prev]
      const next = prev.slice(); next[i] = lot; return next
    })
    if (flash) {
      setFlashId(lot.id)
      window.clearTimeout(timers.current.flash)
      timers.current.flash = window.setTimeout(() => setFlashId(null), 900)
    }
  }, [])

  const markExtended = useCallback((id: number) => {
    setExtendedId(id)
    window.clearTimeout(timers.current.ext)
    timers.current.ext = window.setTimeout(() => setExtendedId(null), 1600)
  }, [])

  const lotExtra = (lot: Lot): Partial<AuctionEvent> => ({
    lotId: lot.id, lotClass: nice(lot.main_class), price: lot.current_price, bidder: lot.current_bidder, status: lot.status,
  })

  useEffect(() => {
    fetchLots().then((l) => setLots(l)).catch(() => log('โหลดรายการไม่สำเร็จ', 'error'))
    fetchSettings().then(setSettings).catch(() => log('โหลดกติกาไม่สำเร็จ ใช้ค่าเริ่มต้น', 'error'))
    const onMsg = (m: WsMessage) => {
      switch (m.type) {
        case 'snapshot':
          setLots((prev) => {
            const map = new Map(prev.map((l) => [l.id, l]))
            m.data.forEach((l) => map.set(l.id, l))
            return [...map.values()].sort((a, b) => b.id - a.id)
          })
          break
        case 'settings': {
          // แจ้งเฉพาะเมื่อกติกาเปลี่ยนจริง (ตอนต่อ WS ครั้งแรก/reconnect server ส่งค่าเดิมมาด้วย)
          const cur = settingsRef.current
          if (cur !== DEFAULT_SETTINGS && JSON.stringify(cur) !== JSON.stringify(m.data))
            log(`กติกาเปลี่ยน: ประมูล ${m.data.duration_seconds} วิ ขั้นต่ำ ${m.data.min_increment} ต่อเวลา ${m.data.soft_close.enabled ? 'เปิด' : 'ปิด'}`, 'settings')
          settingsRef.current = m.data
          setSettings(m.data)
          break
        }
        case 'lot_created':
          upsert(m.data)
          log(`ล็อต #${m.data.id} ${nice(m.data.main_class)} เข้าประมูล เริ่ม ${m.data.start_price} บาท`, 'lot', lotExtra(m.data))
          break
        case 'bid': {
          const prev = lotsRef.current.find((l) => l.id === m.data.id)
          upsert(m.data)
          log(`ล็อต #${m.data.id} ${m.data.current_bidder} เสนอ ${m.data.current_price} บาท`, 'bid',
            { ...lotExtra(m.data), prevBidder: prev?.current_bidder ?? null })
          break
        }
        case 'lot_extended':
          upsert(m.data, false); markExtended(m.data.id)
          log(`ล็อต #${m.data.id} ต่อเวลาครั้งที่ ${m.data.extensions} ปิด ${fmtTime(m.data.ends_at)}`, 'extend', lotExtra(m.data))
          break
        case 'lot_closed':
          upsert(m.data)
          log(m.data.status === 'sold'
            ? `ล็อต #${m.data.id} ขายให้ ${m.data.current_bidder} ที่ ${m.data.current_price} บาท`
            : `ล็อต #${m.data.id} ปิดโดยไม่มีผู้เสนอ`, 'close', lotExtra(m.data))
          break
        case 'reset':
          setLots([])
          setEvents([])
          log(`ผู้ดูแลลบข้อมูลประมูลทั้งหมด (${m.data.lots} ล็อต) เริ่มนับล็อตที่ 1 ใหม่`, 'reset')
          break
      }
    }
    const close = connectWs(onMsg, setConnected)
    return () => { close(); window.clearTimeout(timers.current.flash); window.clearTimeout(timers.current.ext) }
  }, [upsert, log, markExtended])

  const bid = useCallback(async (lotId: number, bidder: string, amount: number) => {
    const lot = await placeBid(lotId, bidder, amount)
    upsert(lot)
    if (lot.extended) markExtended(lot.id)
    return lot
  }, [upsert, markExtended])

  return { lots, settings, setSettings, connected, events, flashId, extendedId, bid }
}
