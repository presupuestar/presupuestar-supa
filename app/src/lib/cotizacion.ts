export interface CotizacionBlue {
  venta: number
  fecha: string
}

let cotizacionCache: { value: CotizacionBlue; expiresAt: number } | null = null
let solicitudPendiente: Promise<CotizacionBlue> | null = null

export function convertirUsdAArs(precioUsd: number, cotizacion: number): number {
  if (!Number.isFinite(precioUsd) || precioUsd < 0) throw new Error('El precio USD del ítem no es válido.')
  if (!Number.isFinite(cotizacion) || cotizacion < 100 || cotizacion > 100_000) {
    throw new Error('La cotización guardada del dólar blue está fuera del rango esperado. Volvé a cargar el ítem con una cotización actual.')
  }
  const convertido = Math.round(precioUsd * cotizacion * 100) / 100
  if (!Number.isFinite(convertido)) throw new Error('El importe convertido a pesos no es válido.')
  return convertido
}

export async function obtenerCotizacionBlue(): Promise<CotizacionBlue> {
  if (cotizacionCache && cotizacionCache.expiresAt > Date.now()) return cotizacionCache.value
  if (solicitudPendiente) return solicitudPendiente
  solicitudPendiente = cargarCotizacionBlue()
  try {
    const value = await solicitudPendiente
    cotizacionCache = { value, expiresAt: Date.now() + 2 * 60 * 1000 }
    return value
  } finally {
    solicitudPendiente = null
  }
}

async function cargarCotizacionBlue(): Promise<CotizacionBlue> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const respuesta = await fetch('https://dolarapi.com/v1/dolares/blue', { signal: controller.signal })
    if (!respuesta.ok) throw new Error(`El servicio de cotización respondió con el estado ${respuesta.status}.`)

    const datos: unknown = await respuesta.json()
    if (!datos || typeof datos !== 'object') throw new Error('El servicio devolvió una cotización con formato inválido.')
    const cotizacion = datos as { venta?: unknown; fechaActualizacion?: unknown; casa?: unknown; moneda?: unknown }
    const venta = typeof cotizacion.venta === 'number' ? cotizacion.venta : NaN
    const fecha = typeof cotizacion.fechaActualizacion === 'string' ? cotizacion.fechaActualizacion : ''
    if (cotizacion.casa !== 'blue' || cotizacion.moneda !== 'USD' || !Number.isFinite(venta) || venta < 100 || venta > 100_000 || !fecha || !Number.isFinite(Date.parse(fecha))) {
      throw new Error('El servicio devolvió una cotización blue incompleta o inválida.')
    }
    return { venta, fecha }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('La consulta del dólar blue tardó demasiado. Verificá tu conexión e intentá de nuevo.')
    }
    if (error instanceof TypeError) {
      throw new Error('No se pudo conectar con el servicio de cotización del dólar blue. Verificá tu conexión e intentá de nuevo.')
    }
    if (!(error instanceof Error)) throw new Error('El servicio de cotización del dólar blue devolvió una respuesta inválida.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
