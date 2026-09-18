import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ตอน dev: หน้าเว็บอยู่พอร์ต 5173 แต่ /api และ /ws ถูกส่งต่อไป backend พอร์ต 8000
// ตอน build: ไฟล์ใน dist/ ถูก backend เสิร์ฟเองที่พอร์ตเดียว ไม่ต้องใช้ proxy
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // เปิดให้เครื่องอื่นในวง LAN เข้าถึงได้
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
