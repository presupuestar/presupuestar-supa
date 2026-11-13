import { FunctionsHttpError } from '@supabase/supabase-js'

/** Mensajes de Supabase Auth en inglés que conviene explicar en castellano. */
const TRADUCCIONES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'El correo de esta cuenta todavía no está confirmado.'],
  [/already (?:been )?registered|already exists|email_exists/i, 'Ya existe una cuenta con ese correo electrónico.'],
  [/should be different from the old password|same_password/i, 'La contraseña nueva tiene que ser distinta de la actual.'],
  [/password should contain at least one character of each/i, 'La contraseña tiene que combinar minúsculas, mayúsculas, números y símbolos.'],
  [/password should be at least (\d+) characters/i, 'La contraseña es demasiado corta para la configuración de seguridad de Supabase.'],
  [/known to be weak|weak_password|pwned/i, 'Esa contraseña es demasiado común o fue filtrada. Elegí otra.'],
  [/reauthentication|reauthenticate/i, 'Por seguridad, cerrá sesión, volvé a ingresar y cambiá la contraseña enseguida.'],
  [/rate limit|too many requests/i, 'Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.'],
  [/database error (?:creating|saving) new user/i, 'Supabase no pudo crear el perfil del usuario. Revisá que las migraciones de la base estén aplicadas.'],
  [/failed to fetch|networkerror|load failed/i, 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.'],
]

export function traducirError(mensaje: string): string {
  for (const [patron, traduccion] of TRADUCCIONES) if (patron.test(mensaje)) return traduccion
  return mensaje
}

/** Conserva los mensajes explícitos de Supabase y usa un texto claro para errores desconocidos. */
export function mensajeError(e: unknown, generico = 'No se pudo completar la operación.'): string {
  if (e instanceof Error) return e.message ? traducirError(e.message) : generico
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return traducirError(e.message)
  return generico
}

/**
 * Las Edge Functions devuelven `{ error }` con el motivo real, pero supabase-js lo
 * reemplaza por "Edge Function returned a non-2xx status code". Recupera el motivo.
 */
export async function errorDeFuncion(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const texto = await (error.context as Response).clone().text()
      if (texto) {
        try {
          const cuerpo: unknown = JSON.parse(texto)
          if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && typeof cuerpo.error === 'string') {
            return new Error(traducirError(cuerpo.error))
          }
        } catch { /* no es JSON */ }
        return new Error(traducirError(texto))
      }
      return new Error(`La función de administración respondió con el estado ${(error.context as Response).status}.`)
    } catch { /* sin cuerpo legible */ }
  }
  return error instanceof Error ? new Error(traducirError(error.message)) : new Error('No se pudo completar la operación.')
}
