import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { getAdminToken } from './api'
import { Header } from './components/Header'
import { ToastProvider, useToast } from './components/Toasts'
import { useAuction, type AuctionEvent } from './hooks/useAuction'
import { AdminPage } from './pages/AdminPage'
import { AuctionPage } from './pages/AuctionPage'

/** hash router เล็ก ๆ: #/ = ประมูล, #/admin = ตั้งค่า (ไม่ต้องใช้ไลบรารี และทำงานกับ SPA fallback ของ backend) */
function useHashRoute() {
  const parse = () => location.hash.replace(/^#\/?/, '').split('?')[0]
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const fn = () => setRoute(parse())
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return route
}

function Shell() {
  const route = useHashRoute()
  const toast = useToast()
  const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminToken()))

  // แจ้งเตือนเหตุการณ์สำคัญเป็น toast (ล็อตใหม่ / ต่อเวลา / ปิดล็อต) ส่วน bid ทั่วไปดูใน feed
  const onEvent = useCallback((e: AuctionEvent) => {
    if (e.kind === 'lot') toast(e.text, 'info')
    else if (e.kind === 'extend') toast(e.text, 'warn')
    else if (e.kind === 'close') toast(e.text, 'success')
    else if (e.kind === 'settings') toast(e.text, 'info')
  }, [toast])
  const auction = useAuction(onEvent)

  return (
    <div className="app">
      <Header route={route} connected={auction.connected} isAdmin={isAdmin} />
      <div className="page" key={route}>
        {route === 'admin'
          ? <AdminPage auction={auction} onAuthChange={setIsAdmin} />
          : <AuctionPage auction={auction} />}
      </div>
      <footer className="foot">TESA · ตรวจตำหนิเมล็ดกาแฟด้วย AI และประมูล real-time</footer>
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
