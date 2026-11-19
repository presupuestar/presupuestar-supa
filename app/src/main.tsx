import { aplicarTemaVisual, leerTema } from './lib/temaVisual'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Modo claro/oscuro antes de dibujar, para que no parpadee al cargar.
aplicarTemaVisual(leerTema())

// Si se publicó una versión nueva mientras la app estaba abierta, los archivos viejos ya
// no existen: se recarga una vez para traer los nuevos (como mucho una vez por minuto,
// para no entrar en un bucle si el problema es otro).
window.addEventListener('vite:preloadError', (evento) => {
  const CLAVE = 'presupuestar.recarga-version'
  let ultima = 0
  try { ultima = Number(sessionStorage.getItem(CLAVE) ?? 0) } catch { /* sin almacenamiento */ }
  if (Date.now() - ultima < 60_000) return
  try { sessionStorage.setItem(CLAVE, String(Date.now())) } catch { /* sin almacenamiento */ }
  evento.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)