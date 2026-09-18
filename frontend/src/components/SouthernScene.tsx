/** ภาพประกอบภาคใต้: ทะเลอันดามัน เขาหินปูน มะพร้าว เรือหัวโทง และผลกาแฟโรบัสต้า (SVG ล้วน ปรับตามธีมด้วย currentColor/ตัวแปร) */
export function SouthernScene({ className = '' }: { className?: string }) {
  return (
    <svg className={`scene ${className}`} viewBox="0 0 520 220" role="img" aria-label="ทิวทัศน์ภาคใต้ เขาหินปูน ทะเล มะพร้าว และผลกาแฟ" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-top)" />
          <stop offset="1" stopColor="var(--sky-bottom)" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sea-light)" />
          <stop offset="1" stopColor="var(--sea)" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--amber)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--amber)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ท้องฟ้า + พระอาทิตย์ */}
      <rect width="520" height="220" rx="18" fill="url(#sky)" />
      <circle cx="400" cy="70" r="46" fill="url(#sun)" className="sun" />
      <circle cx="400" cy="70" r="20" fill="var(--amber)" opacity="0.9" />

      {/* เขาหินปูนไกล */}
      <g className="karst far" fill="var(--karst-far)">
        <path d="M60 150 C70 105 88 90 100 96 C108 70 130 60 142 82 C150 100 160 130 166 150 Z" />
        <path d="M300 150 C305 120 318 96 332 102 C338 84 356 78 366 98 C376 118 382 140 386 150 Z" />
      </g>
      {/* เขาหินปูนใกล้ */}
      <g className="karst near" fill="var(--karst)">
        <path d="M180 152 C186 118 200 92 214 100 C222 78 246 70 258 96 C266 112 270 136 276 152 Z" />
        <path d="M420 152 C426 128 438 108 452 114 C458 96 476 92 486 110 C494 126 500 142 504 152 Z" />
      </g>

      {/* ทะเล + คลื่น */}
      <rect x="0" y="150" width="520" height="70" fill="url(#sea)" />
      <g className="waves" stroke="var(--sea-light)" strokeWidth="2" fill="none" opacity="0.7">
        <path d="M0 168 Q20 162 40 168 T80 168 T120 168 T160 168 T200 168 T240 168 T280 168 T320 168 T360 168 T400 168 T440 168 T480 168 T520 168" />
        <path d="M0 186 Q20 180 40 186 T80 186 T120 186 T160 186 T200 186 T240 186 T280 186 T320 186 T360 186 T400 186 T440 186 T480 186 T520 186" opacity="0.5" />
      </g>

      {/* เรือหัวโทง */}
      <g className="boat" transform="translate(300 160)">
        <path d="M-26 0 Q0 10 30 0 L22 8 Q0 14 -18 8 Z" fill="var(--wood)" />
        <path d="M30 0 Q40 -12 34 -22" stroke="var(--wood)" strokeWidth="3" fill="none" />
        <path d="M-2 0 L-2 -20" stroke="var(--wood)" strokeWidth="2" />
        <path d="M-2 -20 L10 -12 L-2 -8 Z" fill="var(--sail)" />
      </g>

      {/* ชายหาด + มะพร้าว */}
      <path d="M0 220 L0 200 Q60 190 120 198 Q180 206 200 220 Z" fill="var(--sand)" />
      <g className="palm" transform="translate(60 200)">
        <path d="M0 0 Q6 -40 4 -78" stroke="var(--trunk)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <g fill="var(--leaf)">
          <path d="M4 -78 Q-30 -84 -46 -62 Q-18 -70 4 -74 Z" />
          <path d="M4 -78 Q38 -86 56 -66 Q28 -72 4 -74 Z" />
          <path d="M4 -78 Q-22 -108 -40 -100 Q-12 -92 4 -76 Z" />
          <path d="M4 -78 Q30 -110 48 -100 Q22 -92 4 -76 Z" />
          <path d="M4 -78 Q0 -114 -6 -118 Q4 -100 6 -78 Z" />
        </g>
        <circle cx="0" cy="-74" r="4" fill="var(--wood)" /><circle cx="8" cy="-73" r="4" fill="var(--wood)" />
      </g>
      <g className="palm small" transform="translate(120 206) scale(0.7)">
        <path d="M0 0 Q-6 -40 -2 -78" stroke="var(--trunk)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <g fill="var(--leaf)">
          <path d="M-2 -78 Q-36 -84 -52 -62 Q-24 -70 -2 -74 Z" />
          <path d="M-2 -78 Q32 -86 50 -66 Q22 -72 -2 -74 Z" />
          <path d="M-2 -78 Q-28 -108 -46 -100 Q-18 -92 -2 -76 Z" />
          <path d="M-2 -78 Q24 -110 42 -100 Q16 -92 -2 -76 Z" />
        </g>
      </g>

      {/* กิ่งกาแฟโรบัสต้า มุมขวาล่าง */}
      <g className="coffee" transform="translate(470 196)">
        <path d="M-40 10 Q-10 -6 30 -2" stroke="var(--leaf-dark)" strokeWidth="3" fill="none" />
        <ellipse cx="-24" cy="-8" rx="14" ry="6" fill="var(--leaf)" transform="rotate(-25 -24 -8)" />
        <ellipse cx="14" cy="-14" rx="14" ry="6" fill="var(--leaf)" transform="rotate(-10 14 -14)" />
        <g fill="var(--cherry)">
          <circle cx="-8" cy="2" r="6" /><circle cx="2" cy="6" r="6" /><circle cx="12" cy="1" r="6" />
          <circle cx="-2" cy="-6" r="6" fill="var(--cherry-ripe)" /><circle cx="22" cy="6" r="6" fill="var(--cherry-ripe)" />
        </g>
        <g fill="#fff" opacity="0.35"><circle cx="-10" cy="0" r="1.6" /><circle cx="0" cy="4" r="1.6" /><circle cx="10" cy="-1" r="1.6" /></g>
      </g>
    </svg>
  )
}
