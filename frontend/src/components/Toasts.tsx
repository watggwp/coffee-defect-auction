import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'info' | 'success' | 'warn' | 'error'
interface Toast { id: number; kind: ToastKind; text: string; leaving?: boolean }

const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

/** แจ้งเตือนมุมขวาล่าง ซ้อนกันได้ หายเอง 3.5 วิ กดปิดได้ */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 260)
  }, [])

  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-4), { id, kind, text }])
    window.setTimeout(() => dismiss(id), 3500)
  }, [dismiss])

  const icons = useMemo<Record<ToastKind, string>>(() => ({ info: 'i', success: '✓', warn: '!', error: '✕' }), [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'leaving' : ''}`}>
            <span className="toast-icon" aria-hidden>{icons[t.kind]}</span>
            <span>{t.text}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="ปิด">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
