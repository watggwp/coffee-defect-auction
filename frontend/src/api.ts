// api.ts - ชนิดข้อมูลและฟังก์ชันคุยกับ backend (REST + WebSocket + admin auth)

export interface Detection { class: string; confidence: number; track_id: number | null }

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
  origin?: Origin | null
}

/** แหล่งปลูก (ตั้งต่อกล้องใน backend/config.json -> origin) */
export interface Origin { province?: string; farm?: string; variety?: string; region?: string }

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

export interface SettingsPatch {
  duration_seconds?: number
  min_increment?: number
  soft_close?: Partial<SoftClose>
}

export type WsMessage =
  | { type: 'snapshot'; data: Lot[]; ts: string }
  | { type: 'settings'; data: Settings; ts: string }
  | { type: 'lot_created'; data: Lot; ts: string }
  | { type: 'bid'; data: Lot; ts: string; extended?: boolean }
  | { type: 'lot_extended'; data: Lot; ts: string }
  | { type: 'lot_closed'; data: Lot; ts: string }
  | { type: 'reset'; data: { lots: number; bids: number }; ts: string }

export class ApiError extends Error {
  status: number
  extra: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message); this.status = status; this.extra = extra
  }
}

async function request<T>(path: string, init: RequestInit = {}, fallback = 'เกิดข้อผิดพลาด'): Promise<T> {
  const r = await fetch(path, init)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string }).error || fallback, body)
  return body as T
}
const jsonInit = (method: string, body: unknown, token?: string | null): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})

export interface Bid { id: number; lot_id: number; bidder: string; amount: number; created_at: string }

// ---------- ประมูล ----------
export const fetchLots = (status?: string) =>
  request<Lot[]>(`/api/lots${status ? `?status=${status}` : ''}`, {}, 'โหลดรายการไม่สำเร็จ')
export const fetchLot = (id: number) =>
  request<Lot & { bids: Bid[] }>(`/api/lots/${id}`, {}, 'ไม่พบล็อต')
export const fetchSettings = () => request<Settings>('/api/settings', {}, 'โหลดกติกาไม่สำเร็จ')
export const placeBid = (lotId: number, bidder: string, amount: number) =>
  request<Lot & { extended?: boolean }>(`/api/lots/${lotId}/bids`, jsonInit('POST', { bidder, amount }), 'เสนอราคาไม่สำเร็จ')

// ---------- admin ----------
const TOKEN_KEY = 'admin_token'
export const getAdminToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setAdminToken = (t: string | null) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}

export interface AdminSession { role: 'admin'; expires_at: string; default_password?: boolean }

export const adminLogin = async (password: string) => {
  const r = await request<{ token: string; role: 'admin'; expires_at: string }>(
    '/api/admin/login', jsonInit('POST', { password }), 'เข้าสู่ระบบไม่สำเร็จ')
  setAdminToken(r.token)
  return r
}
export const adminLogout = async () => {
  const t = getAdminToken()
  setAdminToken(null)
  if (t) await fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {})
}
export const adminMe = () =>
  request<AdminSession>('/api/admin/me', { headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` } }, 'session หมดอายุ')
export const updateSettings = (patch: SettingsPatch) =>
  request<Settings>('/api/settings', jsonInit('PUT', patch, getAdminToken()), 'บันทึกกติกาไม่สำเร็จ')
/** ลบล็อตและการเสนอราคาทั้งหมด เริ่มเลขล็อตที่ 1 ใหม่ (admin) */
export const adminReset = () =>
  request<{ ok: true; lots: number; bids: number }>('/api/admin/reset', jsonInit('POST', {}, getAdminToken()), 'ลบข้อมูลไม่สำเร็จ')

// ---------- WebSocket ----------
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
    ws.onclose = () => { onStatus(false); if (!closed) timer = window.setTimeout(open, 2000) }
    ws.onerror = () => ws?.close()
  }
  open()
  return () => { closed = true; window.clearTimeout(timer); ws?.close() }
}
