import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const STORAGE_KEY = 'presupuestar.theme'

function currentTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'system' || stored === 'light' || stored === 'dark') return stored
  } catch {
    // The operating-system preference remains available when storage is disabled.
  }
  return 'system'
}

export function PreferenciasVisuales() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system'
        ? (preference.matches ? 'dark' : 'light')
        : theme
    }
    apply()
    if (theme === 'system') preference.addEventListener('change', apply)
    return () => preference.removeEventListener('change', apply)
  }, [theme])

  const toggle = () => {
    const next: Theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
    setTheme(next)
    try { localStorage.setItem(STORAGE_KEY, next) }
    catch { /* The selected theme remains active until the page is reloaded. */ }
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label={`Cambiar tema. Actual: ${theme === 'system' ? 'sistema' : theme === 'dark' ? 'oscuro' : 'claro'}`}>
      <span aria-hidden="true">{theme === 'system' ? '◐' : theme === 'dark' ? '☀' : '☾'}</span>
      <span className="theme-toggle-text">Tema: {theme === 'system' ? 'Sistema' : theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
    </button>
  )
}

export function VolverArriba() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 560)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  if (!visible) return null
  return (
    <button className="volver-arriba" type="button" aria-label="Volver arriba" title="Volver arriba" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <span aria-hidden="true">↑</span>
    </button>
  )
}
