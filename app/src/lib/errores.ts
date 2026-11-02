import { ClientResponseError } from 'pocketbase'

/** Traduce un error de PocketBase a un mensaje que explique qué revisar. */
export function mensajeError(e: unknown, generico = 'No se pudo completar la operación.'): string {
  if (!(e instanceof ClientResponseError)) return generico
  const s = e.status
  if (s === 0 || s >= 500)
    return 'No se pudo conectar con PocketBase. Revisá que esté corriendo (.\\pocketbase.exe serve) y que la dirección sea 127.0.0.1:8090.'
  if (s === 401 || s === 403)
    return 'Tu sesión no es válida o no tenés permiso para esto. Cerrá sesión (Salir) y volvé a ingresar. Si sigue igual, revisá las reglas (API Rules) de la colección en el panel de PocketBase. [código ' + s + ']'
  if (s === 404)
    return 'El servidor no tiene esa colección. Reiniciá PocketBase para que se apliquen las migraciones. [código 404]'
  const traducir: Record<string, string> = {
    validation_required: 'es obligatorio', validation_not_unique: 'ya está en uso', validation_invalid_email: 'no es un correo válido',
    validation_length_out_of_range: 'tiene una longitud no permitida', validation_min_text_constraint: 'es demasiado corto',
  }
  const campos = Object.entries((e.response?.data ?? {}) as Record<string, { code?: string; message?: string }>)
    .map(([campo, v]) => `${campo} ${(v?.code && traducir[v.code]) || v?.message || 'tiene un valor inválido'}`)
  const msg = e.response?.message && !e.response.message.startsWith('Failed to') ? e.response.message : ''
  const detalle = [msg, ...campos].filter(Boolean).join(' · ')
  return detalle ? `${generico} ${detalle} [código ${s}]` : `${generico} [código ${s}]`
}
