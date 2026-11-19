import { aplicarTemaVisual, leerTema } from './lib/temaVisual'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Modo claro/oscuro antes de dibujar, para que no parpadee al cargar.
aplicarTemaVisual(leerTema())

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)