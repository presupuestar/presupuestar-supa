import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo y en preview, /api y /_ se reenvían a PocketBase (por defecto en 8090).
const pb = process.env.PB_URL ?? 'http://127.0.0.1:8090'
const proxy = { '/api': { target: pb, changeOrigin: true }, '/_': { target: pb, changeOrigin: true } }

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
})
