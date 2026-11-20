import { partesSena, requiereSena } from './pagos'
import type { Cobro, Presupuesto } from './tipos'

/**
 * Seguimiento de cobro de los presupuestos aceptados. Es aparte del estado: «Aceptado»
 * dice que el cliente dijo que sí; el cobro, cuánto pagó. Con seña (50% al aceptar)
 * son tres pasos; con cualquier otra forma de pago, dos.
 */
export const cobroDe = (p: Presupuesto): Cobro => p.cobro ?? 'por_cobrar'

/** Solo se sigue el cobro de lo aceptado. */
export const sigueCobro = (p: Presupuesto) => p.estado === 'aceptado'

const conSena = (p: Presupuesto) => requiereSena(p.formaPago) || p.cobro === 'sena'

export const pasosCobro = (p: Presupuesto): Cobro[] =>
  conSena(p) ? ['por_cobrar', 'sena', 'cobrado'] : ['por_cobrar', 'cobrado']

export function etiquetaCobro(p: Presupuesto, cobro: Cobro = cobroDe(p)): string {
  if (cobro === 'cobrado') return 'Cobrado'
  if (cobro === 'sena') return 'Seña cobrada'
  return conSena(p) ? 'Seña por cobrar' : 'Por cobrar'
}

const redondear = (n: number) => Math.round(n * 100) / 100
/** Importe de la seña: el porcentaje que dice la forma de pago (50 % si no dice cuánto). */
export const importeSena = (p: Presupuesto) => partesSena(p.total, p.formaPago).sena
/** Porcentaje de la seña, para mostrarlo. */
export const porcentajeDeSena = (p: Presupuesto) => partesSena(p.total, p.formaPago).porcentaje

/** Lo que el cliente todavía debe. */
export function saldoPendiente(p: Presupuesto): number {
  const cobro = cobroDe(p)
  if (cobro === 'cobrado') return 0
  if (cobro === 'sena') return redondear(p.total - importeSena(p))
  return p.total
}

/** Lo que hay que cobrarle ahora: la seña si todavía no la pagó, si no el saldo. */
export const proximoCobro = (p: Presupuesto) =>
  cobroDe(p) === 'por_cobrar' && conSena(p) ? importeSena(p) : saldoPendiente(p)

/** Siguiente paso (para el botón rápido de Inicio). */
export function siguienteCobro(p: Presupuesto): Cobro | null {
  const pasos = pasosCobro(p)
  const i = pasos.indexOf(cobroDe(p))
  return i >= 0 && i < pasos.length - 1 ? pasos[i + 1] : null
}

export const AVISO_COBRO: Record<Cobro, string> = {
  por_cobrar: 'Marcado como por cobrar.',
  sena: 'Seña registrada como cobrada.',
  cobrado: 'Presupuesto marcado como cobrado.',
}
