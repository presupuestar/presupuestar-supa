/** Conserva los mensajes explícitos de Supabase y usa un texto claro para errores desconocidos. */
export function mensajeError(e: unknown, generico = 'No se pudo completar la operación.'): string {
  if (e instanceof Error) return e.message || generico
  return generico
}
