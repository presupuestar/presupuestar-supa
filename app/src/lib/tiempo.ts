/**
 * Fechas contadas como las dice una persona: «hoy», «ayer», «hace 3 días»,
 * «vence mañana». Se cuentan días de calendario, sin importar la hora.
 */
const dia = (f: Date | string) => {
  const d = typeof f === 'string' ? new Date(`${f.slice(0, 10)}T00:00:00`) : f
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Días entre dos fechas de calendario (positivo si `hasta` es posterior). */
export const diasEntre = (desde: Date | string, hasta: Date | string) =>
  Math.round((dia(hasta) - dia(desde)) / 86_400_000)

/** «hoy», «ayer», «hace 5 días», «hace 2 semanas», «hace 3 meses». */
export function haceCuanto(fecha: string, hoy = new Date()): string {
  if (!fecha) return ''
  const dias = diasEntre(fecha, hoy)
  if (!Number.isFinite(dias)) return ''
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 14) return `hace ${dias} días`
  if (dias < 60) return `hace ${Math.round(dias / 7)} semanas`
  const meses = Math.round(dias / 30)
  return meses < 12 ? `hace ${meses} meses` : meses < 18 ? 'hace un año' : `hace ${Math.round(meses / 12)} años`
}

/** «vence hoy», «vence mañana», «vence en 4 días». Vacío si ya venció o no hay fecha. */
export function cuandoVence(ultimoDia: string, hoy = new Date()): string {
  if (!ultimoDia) return ''
  const dias = diasEntre(hoy, ultimoDia)
  if (!Number.isFinite(dias) || dias < 0) return ''
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  return `vence en ${dias} días`
}
