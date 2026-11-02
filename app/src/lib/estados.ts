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
