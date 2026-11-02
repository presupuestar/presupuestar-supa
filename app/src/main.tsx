import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const preferenciaSistema = window.matchMedia('(prefers-color-scheme: dark)')
const aplicarTemaInicial = () => {
  let preferencia: string | null = null
  try { preferencia = localStorage.getItem('presupuestar.theme') } catch { /* Se usa la preferencia del dispositivo. */ }
  document.documentElement.dataset.theme = preferencia === 'dark' || preferencia === 'light'
    ? preferencia
    : preferenciaSistema.matches ? 'dark' : 'light'
}
aplicarTemaInicial()
preferenciaSistema.addEventListener('change', aplicarTemaInicial)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)