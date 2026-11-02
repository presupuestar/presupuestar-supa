import { repositorio } from './repositorio'
import type { Empresa } from './tipos'

const ESTILO_FUENTES = 'tema-fuentes'

/** Aplica colores y tipografías de la empresa (su brandbook) a toda la app. */
export function aplicarTema(e: Empresa) {
  const raiz = document.documentElement.style
  raiz.setProperty('--primario', e.colorPrimario)
  raiz.setProperty('--acento', e.colorAcento)

  const titulos = e.fuenteTitulos || 'Poppins'
  const texto = e.fuenteTexto || titulos
  const reglas: string[] = []

  // Fuente propia subida como archivo (.ttf / .woff2) o fuente de Google Fonts por nombre.
  const registrar = (familia: string, archivo?: string) => {
    const url = repositorio.empresa.archivoUrl(e, archivo)
    if (url) reglas.push(`@font-face{font-family:"${familia}";src:url("${url}");font-display:swap}`)
    else if (familia !== 'Poppins') {
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`
      document.head.appendChild(l)
    }
  }
  registrar(titulos, e.fuenteTitulosArchivo)
  if (texto !== titulos) registrar(texto, e.fuenteTextoArchivo)

  let estilo = document.getElementById(ESTILO_FUENTES) as HTMLStyleElement | null
  if (!estilo) { estilo = document.createElement('style'); estilo.id = ESTILO_FUENTES; document.head.appendChild(estilo) }
  estilo.textContent = reglas.join('\n')

  raiz.setProperty('--fuente-titulos', `"${titulos}", system-ui, sans-serif`)
  raiz.setProperty('--fuente-texto', `"${texto}", system-ui, sans-serif`)
  document.title = e.nombre
}

/** Quita la marca de la empresa (al cerrar sesión o antes de ingresar). */
export function restablecerTema() {
  const raiz = document.documentElement.style
  for (const v of ['--primario', '--acento', '--fuente-titulos', '--fuente-texto']) raiz.removeProperty(v)
  const estilo = document.getElementById(ESTILO_FUENTES)
  if (estilo) estilo.textContent = ''
  document.title = 'PresupuestAR'
}
