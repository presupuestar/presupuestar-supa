/**
 * Modo claro / oscuro. Por defecto sigue la preferencia del sistema; si la persona
 * elige uno, se recuerda en este navegador.
 */
export type Tema = 'claro' | 'oscuro' | 'sistema'

const CLAVE = 'presupuestar.tema'

export function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE)
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function aplicarTemaVisual(tema: Tema) {
  const raiz = document.documentElement
  if (tema === 'sistema') delete raiz.dataset.tema
  else raiz.dataset.tema = tema
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
  } catch { /* sin almacenamiento: se usa solo en esta visita */ }
}

/** Modo que se está viendo ahora (resuelve «sistema»). */
export function temaEfectivo(): 'claro' | 'oscuro' {
  const elegido = document.documentElement.dataset.tema
  if (elegido === 'claro' || elegido === 'oscuro') return elegido
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}
