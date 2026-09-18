import { useEffect, useState } from 'react'

type Scheme = 'light' | 'dark' | null // null = ตามระบบ

function readScheme(): Scheme {
  try { const s = localStorage.getItem('color-scheme'); return s === 'light' || s === 'dark' ? s : null } catch { return null }
}
function applyScheme(s: Scheme) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (meta) meta.content = s ?? 'light dark'
  if (s) document.documentElement.dataset.theme = s
  else delete document.documentElement.dataset.theme
  try { s ? localStorage.setItem('color-scheme', s) : localStorage.removeItem('color-scheme') } catch { /* ignore */ }
}

/** ปุ่มสลับธีม 2 สถานะ: ตามระบบ หรือ ปักธีมตรงข้ามกับระบบ */
function ThemeToggle() {
  const [scheme, setScheme] = useState<Scheme>(readScheme)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  const effectiveDark = scheme ? scheme === 'dark' : systemDark
  const toggle = () => {
    const next: Scheme = scheme ? null : (systemDark ? 'light' : 'dark')
    applyScheme(next); setScheme(next)
  }
  return (
    <button className="icon-btn" onClick={toggle} aria-label={effectiveDark ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด'}
      title={scheme ? 'ปักธีมไว้ กดเพื่อกลับไปตามระบบ' : 'ตามระบบ กดเพื่อสลับ'}>
      <span className={`theme-icon ${effectiveDark ? 'moon' : 'sun'}`} aria-hidden />
    </button>
  )
}

export function Header({ route, connected, isAdmin }: { route: string; connected: boolean; isAdmin: boolean }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <span className="brand-mark" aria-hidden>☕</span>
        <span>
          <strong>ประมูลเมล็ดกาแฟ</strong>
          <small>AI ตรวจตำหนิ · ประมูล real-time</small>
        </span>
      </a>
      <nav className="nav" aria-label="เมนูหลัก">
        <a href="#/" className={route === '' ? 'active' : ''}>ประมูล</a>
        <a href="#/admin" className={route === 'admin' ? 'active' : ''}>{isAdmin ? 'ตั้งค่า (admin)' : 'Admin'}</a>
      </nav>
      <div className="top-right">
        <span className={`conn ${connected ? 'on' : 'off'}`} title="สถานะเชื่อมต่อ real-time">
          <span className="dot" aria-hidden />{connected ? 'สด' : 'เชื่อมต่อ…'}
        </span>
        <ThemeToggle />
      </div>
    </header>
  )
}
