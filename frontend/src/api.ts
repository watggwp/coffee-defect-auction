// api.ts - ชนิดข้อมูลและฟังก์ชันคุยกับ backend (REST + WebSocket)

export interface Detection {
  class: string
  confidence: number
  track_id: number | null
}

export interface Lot {
  id: number
  created_at: string
  device: string
  detected_at: string
  main_class: string
  detections: Detection[]
  start_price: number
  current_price: number
  current_bidder: string | null
  bid_count: number
  ends_at: string
  extensions: number
  status: 'open' | 'sold' | 'unsold'
}

export interface Bid {
  id: number
  lot_id: number
  bidder: string
  amount: number
  created_at: string
}

export interface SoftClose {
  enabled: boolean
  extend_window_seconds: number
  extend_to_seconds: number
  max_extensions: number // 0 = ไม่จำกัด
}

export interface Settings {
  duration_seconds: number
  min_increment: number
  soft_close: SoftClose
}

export type WsMessage =
  | { type: 'snapshot'; data: Lot[]; ts: string }
  | { type: 'settings'; data: Settings; ts: string }
  | { type: 'lot_created'; data: Lot; ts: string }
  | { type: 'bid'; data: Lot; ts: string; extended?: boolean }
  | { type: 'lot_extended'; data: Lot; ts: string }
  | { type: 'lot_closed'; data: Lot; ts: string }

async function json<T>(r: Response, fallback: string): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error || fallback)
  return body as T
}

export const fetchLots = (status?: string) =>
  fetch(`/api/lots${status ? `?status=${status}` : ''}`).then((r) => json<Lot[]>(r, 'โหลดรายการไม่สำเร็จ'))

export const fetchLot = (id: number) =>
  fetch(`/api/lots/${id}`).then((r) => json<Lot & { bids: Bid[] }>(r, 'ไม่พบล็อต'))

export const fetchSettings = () => fetch('/api/settings').then((r) => json<Settings>(r, 'โหลดกติกาไม่สำเร็จ'))

export const updateSoftClose = (patch: Partial<SoftClose>) =>
  fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soft_close: patch }),
  }).then((r) => json<Settings>(r, 'บันทึกกติกาไม่สำเร็จ'))

export const placeBid = (lotId: number, bidder: string, amount: number) =>
  fetch(`/api/lots/${lotId}/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bidder, amount }),
  }).then((r) => json<Lot & { extended?: boolean }>(r, 'เสนอราคาไม่สำเร็จ'))

/** เปิด WebSocket ไป backend พร้อม reconnect อัตโนมัติ คืนฟังก์ชันสำหรับปิด */
export function connectWs(onMessage: (m: WsMessage) => void, onStatus: (ok: boolean) => void): () => void {
  let ws: WebSocket | null = null
  let timer: number | undefined
  let closed = false
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

  const open = () => {
    ws = new WebSocket(url)
    ws.onopen = () => onStatus(true)
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onclose = () => {
      onStatus(false)
      if (!closed) timer = window.setTimeout(open, 2000)
    }
    ws.onerror = () => ws?.close()
  }
  open()
  return () => {
    closed = true
    window.clearTimeout(timer)
    ws?.close()
  }
}
