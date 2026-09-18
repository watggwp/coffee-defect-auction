import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { getAdminToken } from './api'
import { Header } from './components/Header'
import { ToastProvider, useToast } from './components/Toasts'
import { useAuction, type AuctionEvent } from './hooks/useAuction'
import { AdminPage } from './pages/AdminPage'
import { AuctionPage } from './pages/AuctionPage'
import { LotPage } from './pages/LotPage'

type Route = { name: 'home' } | { name: 'admin' } | { name: 'lot'; id: number }

function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0]
  if (h === 'admin') return { name: 'admin' }
  const m = h.match(/^lot\/(\d+)$/)
  if (m) return { name: 'lot', id: Number(m[1]) }
  return { name: 'home' }
}

/** hash router เล็ก ๆ: #/ หน้าแรก, #/lot/12 หน้าล็อต, #/admin ตั้งค่า
 *  ใช้ View Transitions API เปลี่ยนหน้าแบบนุ่ม ๆ ถ้า browser รองรับ */
function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseRoute)
  useEffect(() => {
    const fn = () => {
      const next = parseRoute()
      const d = document as Document & { startViewTransition?: (cb: () => void) => void }
      if (d.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) d.startViewTransition(() => setRoute(next))
      else setRoute(next)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return route
}

function Shell() {
  const route = useHashRoute()
  const toast = useToast()
  const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminToken()))
  // ชื่อผู้เสนอราคาใช้ร่วมกันทุกหน้า จำใน browser นั้น
  const [bidder, setBidder] = useState(() => { try { return localStorage.getItem('bidder') ?? '' } catch { return '' } })
  useEffect(() => { try { localStorage.setItem('bidder', bidder) } catch { /* ignore */ } }, [bidder])

  // toast เหตุการณ์ระดับระบบ: ล็อตใหม่ / กติกาเปลี่ยน / ล้างข้อมูล (ของล็อตเฉพาะดูในหน้าล็อต)
  const onEvent = useCallback((e: AuctionEvent) => {
    if (e.kind === 'lot') toast(e.text, 'info')
    else if (e.kind === 'settings' || e.kind === 'reset') toast(e.text, e.kind === 'reset' ? 'warn' : 'info')
  }, [toast])
  const auction = useAuction(onEvent)

  const routeKey = route.name === 'lot' ? `lot-${route.id}` : route.name
  return (
    <div className="app">
      <Header route={route.name === 'home' ? '' : route.name} connected={auction.connected} isAdmin={isAdmin} />
      <div className="page" key={routeKey}>
        {route.name === 'admin' && <AdminPage auction={auction} onAuthChange={setIsAdmin} />}
        {route.name === 'lot' && <LotPage lotId={route.id} auction={auction} bidder={bidder} setBidder={setBidder} />}
        {route.name === 'home' && <AuctionPage auction={auction} bidder={bidder} setBidder={setBidder} />}
      </div>
      <footer className="foot">
        <div className="batik-line" aria-hidden />
        <b>กาแฟโรบัสต้าจากภาคใต้ของไทย</b> · แหล่งปลูก ชุมพร · ระนอง · สุราษฎร์ธานี · กระบี่ · พังงา · นครศรีธรรมราช
        <br /><small>TESA · ตรวจตำหนิเมล็ดกาแฟด้วย AI และประมูล real-time</small>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}
