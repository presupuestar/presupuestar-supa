/**
 * Formato de importe argentino: sin decimales si es un número entero y, si tiene
 * centavos, siempre con dos (850.000,50 y no 850.000,5).
 */
const opcionesImporte = (n: number): Intl.NumberFormatOptions => {
  const conCentavos = Math.round(Math.abs(n) * 100) % 100 !== 0
  return { minimumFractionDigits: conCentavos ? 2 : 0, maximumFractionDigits: 2 }
}

export const pesos = (n: number) => '$ ' + n.toLocaleString('es-AR', opcionesImporte(n))

export const normalizarMoneda = (moneda?: string) => moneda?.trim().toUpperCase() || 'ARS'

export function importeEnMoneda(n: number, moneda?: string): string {
  const codigo = normalizarMoneda(moneda)
  return `${codigo} ${n.toLocaleString('es-AR', opcionesImporte(n))}`
}

/**
 * Importes al estilo argentino: punto de miles y coma decimal.
 *   "150.000" → 150000    "1.250,50" → 1250.5    "25,5" → 25.5    "25.5" → 25.5
 * Devuelve NaN si el texto no es un número.
 */
export function parseImporte(texto: string): number {
  let t = texto.trim().replace(/\s/g, '').replace(/^\$/, '')
  if (t === '') return NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

/** Cantidades: acepta coma o punto como decimal (1,5 o 1.5). */
export function parseCantidad(texto: string): number {
  const t = texto.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

/** Número para mostrar dentro de un campo: 150000 → "150.000", 25000.5 → "25.000,50". */
export const formatearImporte = (n: number) => n.toLocaleString('es-AR', opcionesImporte(n))

/** Fecha guardada ("2026-10-08 12:00:00.000Z") → "08/10/2026". */
export const fechaCorta = (f: string) => { const [a, m, d] = f.slice(0, 10).split('-'); return `${d}/${m}/${a}` }
