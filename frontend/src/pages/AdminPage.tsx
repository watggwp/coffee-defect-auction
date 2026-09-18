import { useCallback, useEffect, useState } from 'react'
import { ApiError, adminLogin, adminLogout, adminMe, getAdminToken, updateSettings, type Settings, type SettingsPatch } from '../api'
import { useToast } from '../components/Toasts'
import type { useAuction } from '../hooks/useAuction'

// ---------------------------------------------------------------- Login
function LoginCard({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [lockUntil, setLockUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (lockUntil > now) { const t = setTimeout(() => setNow(Date.now()), 500); return () => clearTimeout(t) } }, [lockUntil, now])
  const locked = lockUntil > now

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await adminLogin(password)
      onDone()
    } catch (ex) {
      const ae = ex as ApiError
      const left = ae.extra?.attempts_left as number | undefined
      const retry = ae.extra?.retry_after as number | undefined
      if (retry) { setLockUntil(Date.now() + retry * 1000); setNow(Date.now()) }
      setErr(ae.message + (left !== undefined && left > 0 ? ` (เหลือ ${left} ครั้ง)` : ''))
      setShake((s) => s + 1)
      setPassword('')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" key={shake} data-shake={shake > 0 ? '' : undefined} onSubmit={submit}>
        <div className="lock-art" aria-hidden><span>🔐</span></div>
        <h1>เข้าสู่ระบบผู้ดูแล</h1>
        <p className="muted">สำหรับตั้งค่ากติกาประมูล ผู้เสนอราคาทั่วไปไม่ต้องเข้าสู่ระบบ</p>
        <label className="field">
          <span>รหัสผ่าน admin</span>
          <span className="pw">
            <input id="current-password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password"
              required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} disabled={locked}
              enterKeyHint="go" placeholder="••••••••" />
            <button type="button" className="ghost small" onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? 'ซ่อน' : 'แสดง'}
            </button>
          </span>
        </label>
        {err && <div className="err" role="alert">{err}</div>}
        {locked && <div className="err" role="alert">ล็อกชั่วคราว ลองใหม่ใน {Math.ceil((lockUntil - now) / 1000)} วิ</div>}
        <button className="primary big" type="submit" disabled={busy || locked || !password}>
          {busy ? <span className="spinner" aria-hidden /> : null}เข้าสู่ระบบ
        </button>
        <p className="muted tiny">ในอนาคตจะเพิ่มการเข้าสู่ระบบสำหรับผู้เสนอราคา (Google / อีเมล OTP) ที่หน้านี้</p>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- Settings
function NumberField({ label, hint, value, min, disabled, onChange, suffix }: {
  label: string; hint?: string; value: number; min: number; disabled?: boolean; suffix: string
  onChange: (v: number) => void
}) {
  return (
    <label className="field num">
      <span>{label}</span>
      <span className="num-wrap">
        <input type="number" inputMode="numeric" min={min} value={value} disabled={disabled}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))} />
        <em>{suffix}</em>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  )
}

function SettingsPanel({ settings, onSaved, onLogout, defaultPassword, expiresAt }: {
  settings: Settings; onSaved: (s: Settings) => void; onLogout: () => void; defaultPassword: boolean; expiresAt: string
}) {
  const toast = useToast()
  const [draft, setDraft] = useState<Settings>(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(settings), [settings])
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const sc = draft.soft_close
  const unlimited = sc.max_extensions <= 0
  const [lastMax, setLastMax] = useState(sc.max_extensions > 0 ? sc.max_extensions : 10)
  useEffect(() => { if (sc.max_extensions > 0) setLastMax(sc.max_extensions) }, [sc.max_extensions])

  const setSc = (p: Partial<Settings['soft_close']>) => setDraft((d) => ({ ...d, soft_close: { ...d.soft_close, ...p } }))

  const save = async () => {
    setSaving(true)
    try {
      const patch: SettingsPatch = { duration_seconds: draft.duration_seconds, min_increment: draft.min_increment, soft_close: draft.soft_close }
      const s = await updateSettings(patch)
      onSaved(s)
      toast('บันทึกกติกาแล้ว มีผลกับทุกคนทันที', 'success')
    } catch (ex) {
      const ae = ex as ApiError
      toast(ae.message, 'error')
      if (ae.status === 401) onLogout()
    } finally { setSaving(false) }
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>ตั้งค่ากติกาประมูล</h1>
          <p className="muted">เปลี่ยนแล้วกด "บันทึก" มีผลกับทุกคนทันที · session หมดอายุ {new Date(expiresAt).toLocaleString('th-TH')}</p>
        </div>
        <button className="ghost" onClick={onLogout}>ออกจากระบบ</button>
      </header>

      {defaultPassword && (
        <div className="notice warn">
          ระบบใช้รหัสผ่านค่าเริ่มต้นจาก config.json อยู่ ตั้งรหัสจริงในไฟล์ <code>backend/.env</code> บรรทัด <code>ADMIN_PASSWORD=...</code> แล้วรีสตาร์ท backend
        </div>
      )}

      <div className="panels">
        <section className="panel" style={{ '--i': 0 } as React.CSSProperties}>
          <h2>เวลาและราคา</h2>
          <NumberField label="เวลาประมูลต่อล็อต" suffix="วินาที" min={5} value={draft.duration_seconds}
            hint="ใช้กับล็อตใหม่ที่เข้ามาหลังบันทึก ล็อตที่เปิดอยู่ไม่เปลี่ยน"
            onChange={(v) => setDraft((d) => ({ ...d, duration_seconds: v }))} />
          <NumberField label="ขั้นต่ำที่ต้องเพิ่มจากราคาปัจจุบัน" suffix="บาท" min={1} value={draft.min_increment}
            onChange={(v) => setDraft((d) => ({ ...d, min_increment: v }))} />
        </section>

        <section className={`panel softclose ${sc.enabled ? 'on' : 'off'}`} style={{ '--i': 1 } as React.CSSProperties}>
          <div className="panel-title">
            <h2>ต่อเวลาอัตโนมัติ</h2>
            <label className="switch" title="เมื่อมีคนเสนอราคาตอนใกล้หมดเวลา ระบบเลื่อนเวลาปิดออกไป กันการกดวินาทีสุดท้าย">
              <input type="checkbox" checked={sc.enabled} onChange={(e) => setSc({ enabled: e.target.checked })} />
              <span className="slider" aria-hidden />
              <b>{sc.enabled ? 'เปิด' : 'ปิด'}</b>
            </label>
          </div>
          <p className="muted">ถ้ามีคนเสนอราคาตอนเหลือเวลาน้อยกว่าหน้าต่างที่กำหนด เวลาปิดจะถูกตั้งกลับเป็นค่าที่ตั้งไว้ ถ้าไม่มีใครเสนอเพิ่ม ล็อตปิดตามปกติ</p>
          <div className="row2">
            <NumberField label="หน้าต่างต่อเวลา" suffix="วินาที" min={1} value={sc.extend_window_seconds} disabled={!sc.enabled}
              hint="เหลือน้อยกว่านี้แล้วมีคนเสนอ → ต่อ" onChange={(v) => setSc({ extend_window_seconds: v })} />
            <NumberField label="ตั้งเวลากลับเป็น" suffix="วินาที" min={1} value={sc.extend_to_seconds} disabled={!sc.enabled}
              onChange={(v) => setSc({ extend_to_seconds: v })} />
          </div>
          <div className="row2 align-end">
            <NumberField label="ต่อได้สูงสุดต่อล็อต" suffix="ครั้ง" min={1} value={unlimited ? lastMax : sc.max_extensions}
              disabled={!sc.enabled || unlimited} onChange={(v) => setSc({ max_extensions: v })} />
            <label className="check">
              <input type="checkbox" checked={unlimited} disabled={!sc.enabled}
                onChange={(e) => setSc({ max_extensions: e.target.checked ? 0 : lastMax })} />
              <span>ไม่จำกัดจำนวนครั้ง</span>
            </label>
          </div>
          <div className="preview">
            <b>ตัวอย่าง:</b> เหลือ {Math.max(1, sc.extend_window_seconds - 4)} วิ มีคนเสนอ → {sc.enabled ? `กลับเป็น ${sc.extend_to_seconds} วิ` : 'ไม่ต่อ ปิดตามเวลา'}
            {sc.enabled && (unlimited ? ' ต่อได้เรื่อย ๆ จนไม่มีใครเสนอ' : ` ต่อได้ไม่เกิน ${sc.max_extensions} ครั้ง`)}
          </div>
        </section>
      </div>

      <div className={`savebar ${dirty ? 'show' : ''}`}>
        <span>มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
        <button className="ghost" onClick={() => setDraft(settings)} disabled={saving}>ยกเลิก</button>
        <button className="primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <span className="spinner" aria-hidden /> : null}บันทึก
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Page
export function AdminPage({ auction, onAuthChange }: { auction: ReturnType<typeof useAuction>; onAuthChange: (ok: boolean) => void }) {
  const [state, setState] = useState<'checking' | 'login' | 'ok'>(getAdminToken() ? 'checking' : 'login')
  const [session, setSession] = useState<{ expires_at: string; default_password: boolean }>({ expires_at: '', default_password: false })

  const check = useCallback(async () => {
    if (!getAdminToken()) { setState('login'); onAuthChange(false); return }
    try {
      const me = await adminMe()
      setSession({ expires_at: me.expires_at, default_password: Boolean(me.default_password) })
      setState('ok'); onAuthChange(true)
    } catch { await adminLogout(); setState('login'); onAuthChange(false) }
  }, [onAuthChange])
  useEffect(() => { check() }, [check])

  const logout = async () => { await adminLogout(); setState('login'); onAuthChange(false) }

  if (state === 'checking') return <div className="center muted"><span className="spinner" aria-hidden /> กำลังตรวจสอบ session…</div>
  if (state === 'login') return <LoginCard onDone={check} />
  return (
    <SettingsPanel settings={auction.settings} onSaved={auction.setSettings} onLogout={logout}
      defaultPassword={session.default_password} expiresAt={session.expires_at} />
  )
}
