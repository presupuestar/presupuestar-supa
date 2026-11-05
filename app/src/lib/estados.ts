import type { Estado } from './tipos'

export const ETIQUETA: Record<Estado, string> = {
  borrador: 'Borrador', pendiente: 'Pendiente', aceptado: 'Aceptado', rechazado: 'Rechazado',
}

/** A qué estado se puede pasar desde cada uno, y cómo se llama la acción. */
const ACCIONES: Record<Estado, { a: Estado; texto: string }[]> = {
  borrador: [{ a: 'pendiente', texto: 'Emitir (queda pendiente)' }],
  pendiente: [{ a: 'aceptado', texto: 'Marcar como aceptado' }, { a: 'rechazado', texto: 'Marcar como rechazado' }],
  aceptado: [{ a: 'pendiente', texto: 'Volver a pendiente' }],
  rechazado: [{ a: 'pendiente', texto: 'Volver a pendiente' }],
}

/** Opciones del selector de estado: primero el actual, después los cambios posibles. */
export const opcionesEstado = (actual: Estado) => [
  { valor: actual, texto: ETIQUETA[actual] },
  ...ACCIONES[actual].map((x) => ({ valor: x.a, texto: x.texto })),
]

/** Se pueden editar borradores, pendientes y aceptados. */
export const sePuedeEditar = (e: Estado) => e === 'borrador' || e === 'pendiente' || e === 'aceptado'

/** La caducidad es un indicador derivado: no modifica el estado guardado del presupuesto. */
export function estaVencido(fechaEmision: string, validezDias?: number, hoy = new Date()): boolean {
  if (!fechaEmision || !validezDias || validezDias < 1) return false
  const emision = new Date(`${fechaEmision.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(emision.getTime())) return false
  emision.setDate(emision.getDate() + Math.floor(validezDias))
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return hoySinHora >= emision
}

/** Último día inclusive de vigencia: la fecha guardada o emisión + (días − 1). */
export function fechaVigencia(fechaEmision: string, validezDias?: number, vigenteHasta?: string): string {
  if (vigenteHasta) return vigenteHasta.slice(0, 10)
  if (!fechaEmision || !validezDias || validezDias < 1) return ''
  const emision = new Date(`${fechaEmision.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(emision.getTime())) return ''
  emision.setDate(emision.getDate() + Math.floor(validezDias) - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${emision.getFullYear()}-${p(emision.getMonth() + 1)}-${p(emision.getDate())}`
}

/** Un pendiente está caducado cuando hoy es posterior a su fecha de vigencia. */
export function presupuestoCaducado(
  presupuesto: { estado: Estado; fechaEmision: string; validezDias?: number; vigenteHasta?: string },
  validezEmpresa?: number,
  hoy = new Date(),
): boolean {
  if (presupuesto.estado !== 'pendiente') return false
  const limite = fechaVigencia(presupuesto.fechaEmision, presupuesto.validezDias ?? validezEmpresa, presupuesto.vigenteHasta)
  if (!limite) return estaVencido(presupuesto.fechaEmision, presupuesto.validezDias ?? validezEmpresa, hoy)
  const fin = new Date(`${limite}T00:00:00`)
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return hoySinHora > fin
}
