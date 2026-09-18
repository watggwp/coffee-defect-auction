/** วงแหวนนับถอยหลัง: เต็มวง = total วินาที ลดลงตาม remaining สีตาม state */
export function CountdownRing({ remainingMs, totalMs, state, size = 64 }: {
  remainingMs: number
  totalMs: number
  state: 'normal' | 'window' | 'nowindow' | 'closed'
  size?: number
}) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const ratio = Math.max(0, Math.min(1, totalMs > 0 ? remainingMs / totalMs : 0))
  const secs = Math.max(0, Math.ceil(remainingMs / 1000))
  const label = state === 'closed' ? '—' : secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : String(secs)
  return (
    <div className={`ring ${state}`} style={{ width: size, height: size }} title={state === 'closed' ? 'ปิดแล้ว' : `เหลือ ${secs} วินาที`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r}
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring-label">{label}</span>
    </div>
  )
}
