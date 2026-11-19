import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

/**
 * Todos los errores que ve el usuario pasan por acá y salen en castellano.
 * 1) Códigos conocidos (Postgres, PostgREST, Supabase Auth).
 * 2) Mensajes conocidos en inglés (Auth, Storage, red, lector de PDF).
 * 3) Si el mensaje sigue en inglés, se muestra el texto genérico de la pantalla
 *    y el original queda en la consola para poder diagnosticarlo.
 */

const SIN_ACTUALIZAR = 'La base de datos no está actualizada. Avisale al administrador para que aplique las migraciones pendientes.'
const SIN_PERMISO = 'No tenés permiso para hacer esta acción. Si creés que es un error, consultalo con el administrador de tu empresa.'
const SESION_VENCIDA = 'La sesión o el enlace ya no es válido. Volvé a ingresar o pedí un enlace nuevo.'
const SIN_CONEXION = 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.'

/** Códigos de Postgres / PostgREST / Supabase Auth. */
const POR_CODIGO: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'Este registro está vinculado a otros datos y no se puede modificar ni eliminar así.',
  '23514': 'Algún dato no tiene un valor permitido. Revisá el formulario.',
  '23502': 'Falta completar un dato obligatorio.',
  '22001': 'Algún texto es demasiado largo. Acortalo y probá de nuevo.',
  '22P02': 'Algún dato tiene un formato inválido.',
  '22003': 'Algún número está fuera del rango permitido.',
  '22007': 'Alguna fecha tiene un formato inválido.',
  '42501': SIN_PERMISO,
  '42703': SIN_ACTUALIZAR,
  '42P01': SIN_ACTUALIZAR,
  '42883': SIN_ACTUALIZAR,
  'PGRST202': SIN_ACTUALIZAR,
  'PGRST204': SIN_ACTUALIZAR,
  'PGRST205': SIN_ACTUALIZAR,
  'PGRST116': 'No se encontró el registro. Puede que se haya eliminado o que no tengas acceso.',
  'PGRST301': SESION_VENCIDA,
  'PGRST303': SESION_VENCIDA,
  '57014': 'La operación tardó demasiado. Probá de nuevo en unos segundos.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'El correo de esta cuenta todavía no está confirmado.',
  user_already_exists: 'Ya existe una cuenta con ese correo electrónico.',
  email_exists: 'Ya existe una cuenta con ese correo electrónico.',
  same_password: 'La contraseña nueva tiene que ser distinta de la actual.',
  weak_password: 'La contraseña es demasiado débil. Usá más caracteres y combiná letras, números y símbolos.',
  reauthentication_needed: 'Por seguridad, cerrá sesión, volvé a ingresar y cambiá la contraseña enseguida.',
  over_email_send_rate_limit: 'Se alcanzó el límite de correos por hora. Probá más tarde.',
  over_request_rate_limit: 'Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.',
  user_not_found: 'No se encontró el usuario.',
  user_banned: 'Esta cuenta está bloqueada. Consultalo con el administrador.',
  signup_disabled: 'El registro de cuentas nuevas está deshabilitado.',
  email_address_invalid: 'El correo electrónico no es válido.',
  email_address_not_authorized: 'Este correo no está autorizado para recibir mensajes. Revisá la configuración de correo de Supabase.',
  session_not_found: SESION_VENCIDA,
  session_expired: SESION_VENCIDA,
  refresh_token_not_found: SESION_VENCIDA,
  refresh_token_already_used: SESION_VENCIDA,
  bad_jwt: SESION_VENCIDA,
  otp_expired: 'El enlace ya venció o se usó. Pedí uno nuevo.',
  flow_state_not_found: 'El enlace ya venció o se abrió en otro navegador. Pedí uno nuevo.',
  flow_state_expired: 'El enlace ya venció. Pedí uno nuevo.',
  bad_code_verifier: 'El enlace se abrió en otro navegador. Abrilo en el mismo donde lo pediste o pedí uno nuevo.',
  validation_failed: 'Algún dato no es válido. Revisá el formulario.',
  unexpected_failure: 'Ocurrió un error inesperado en el servidor. Probá de nuevo en unos minutos.',
}

/** Mensajes en inglés conocidos. El orden importa: lo más específico primero. */
const POR_MENSAJE: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  // Supabase Auth
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'El correo de esta cuenta todavía no está confirmado.'],
  [/already (?:been )?registered|user already exists|email.*already exists/i, 'Ya existe una cuenta con ese correo electrónico.'],
  [/should be different from the old password/i, 'La contraseña nueva tiene que ser distinta de la actual.'],
  [/password should contain at least one character of each/i, 'La contraseña tiene que combinar minúsculas, mayúsculas, números y símbolos.'],
  [/password should be at least (\d+) characters?/i, (m) => `La contraseña tiene que tener al menos ${m[1]} caracteres.`],
  [/password.*(?:known to be weak|easy to guess|pwned|leaked)/i, 'Esa contraseña es demasiado común o apareció en una filtración. Elegí otra.'],
  [/password is required|missing password/i, 'Escribí la contraseña.'],
  [/reauthenticat/i, 'Por seguridad, cerrá sesión, volvé a ingresar y cambiá la contraseña enseguida.'],
  [/error sending .*email|smtp|5\.7\.8|badcredentials/i, 'No se pudo enviar el correo. Revisá la configuración de correo (SMTP) de Supabase.'],
  [/email rate limit/i, 'Se alcanzó el límite de correos por hora. Probá más tarde.'],
  [/for security purposes, you can only request this after (\d+) seconds?/i, (m) => `Por seguridad, esperá ${m[1]} segundos antes de volver a pedirlo.`],
  [/rate limit|too many requests/i, 'Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.'],
  [/database error (?:creating|saving|updating|finding) (?:new )?user/i, 'No se pudo guardar el usuario en la base de datos. Revisá que las migraciones estén aplicadas.'],
  [/user not found/i, 'No se encontró el usuario.'],
  [/user (?:is )?banned/i, 'Esta cuenta está bloqueada. Consultalo con el administrador.'],
  [/signups? (?:not allowed|(?:is )?disabled)/i, 'El registro de cuentas nuevas está deshabilitado.'],
  [/unable to validate email address|invalid email|email address .* is invalid/i, 'El correo electrónico no es válido.'],
  [/new email address should be different/i, 'El correo nuevo tiene que ser distinto del actual.'],
  [/email link is invalid or has expired|token has expired or is invalid|otp.*expired/i, 'El enlace ya venció o se usó. Pedí uno nuevo.'],
  [/flow state|code verifier/i, 'El enlace ya venció o se abrió en otro navegador. Pedí uno nuevo.'],
  [/jwt|auth session missing|session (?:not found|expired)|invalid refresh token|refresh token (?:not found|already used)/i, SESION_VENCIDA],
  // Postgres / PostgREST (cuando llegan sin código)
  [/duplicate key value/i, 'Ya existe un registro con esos datos.'],
  [/row-level security|permission denied/i, SIN_PERMISO],
  [/violates foreign key/i, 'Este registro está vinculado a otros datos y no se puede modificar ni eliminar así.'],
  [/violates check constraint/i, 'Algún dato no tiene un valor permitido. Revisá el formulario.'],
  [/violates not-null/i, 'Falta completar un dato obligatorio.'],
  [/value too long/i, 'Algún texto es demasiado largo. Acortalo y probá de nuevo.'],
  [/invalid input syntax/i, 'Algún dato tiene un formato inválido.'],
  [/column .* does not exist|could not find .* in the schema cache|relation .* does not exist|function .* does not exist/i, SIN_ACTUALIZAR],
  [/json object requested, multiple \(or no\) rows returned|no rows returned/i, 'No se encontró el registro. Puede que se haya eliminado o que no tengas acceso.'],
  [/statement timeout|canceling statement/i, 'La operación tardó demasiado. Probá de nuevo en unos segundos.'],
  // Storage
  [/resource already exists|duplicate/i, 'Ya existe un archivo con ese nombre.'],
  [/payload too large|exceeded the maximum allowed size|entity too large/i, 'El archivo es demasiado grande.'],
  [/mime type .* not supported|invalid mime/i, 'Ese tipo de archivo no está permitido.'],
  [/bucket not found|object not found/i, 'No se encontró el archivo.'],
  // Edge Functions y red
  [/edge function returned a non-2xx/i, 'El servidor rechazó la operación. Probá de nuevo.'],
  [/failed to send a request to the edge function|relay error/i, SIN_CONEXION],
  // Una pestaña abierta desde antes de publicar una versión nueva pide archivos que ya no existen.
  [/dynamically imported module|importing a module script failed|module script failed|unable to preload css|chunkloaderror/i, 'Hay una versión nueva de la app. Recargá la página (F5) y probá de nuevo.'],
  [/failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet_disconnected/i, SIN_CONEXION],
  [/aborted|timed? ?out/i, 'La operación tardó demasiado. Revisá tu conexión y probá de nuevo.'],
  // Lector de PDF (pdf.js)
  [/invalid pdf|pdf structure|missing pdf/i, 'El archivo no es un PDF válido o está dañado.'],
  [/no password given|incorrect password|password.*pdf/i, 'El PDF está protegido con contraseña. Quitale la protección y probá de nuevo.'],
  [/unexpected server response/i, 'No se pudo leer el PDF. Probá de nuevo.'],
  // Portapapeles
  [/clipboard|write permission denied|document is not focused/i, 'No se pudo copiar. Seleccioná el texto a mano.'],
]

/** Heurística: ¿el texto está en inglés? (sin palabras ni signos propios del castellano). */
function pareceIngles(texto: string): boolean {
  if (/[áéíóúñ¿¡]/i.test(texto)) return false
  if (/\b(?:el|la|los|las|del|que|una?|por|para|con|no se|est[aá]|tiene|debe|sin)\b/i.test(texto)) return false
  return /\b(?:the|is|are|was|not|of|to|for|with|from|failed|error|invalid|cannot|can't|could|unable|unexpected|denied|exceeded|required|missing|found|does|must|should|please|request|already)\b/i.test(texto)
}

/** Restricciones únicas con un mensaje más claro que el genérico. */
const POR_RESTRICCION: [RegExp, string][] = [
  [/company_roles_company_id_name_key/i, 'Ya existe un rol con ese nombre en tu empresa.'],
  [/profiles_pkey|users_email/i, 'Ya existe una cuenta con ese correo electrónico.'],
]

export function traducirError(mensaje: string, generico = 'No se pudo completar la operación. Probá de nuevo.', codigo?: string): string {
  for (const [patron, texto] of POR_RESTRICCION) if (patron.test(mensaje)) return texto
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo]
  // Mensajes mixtos del servidor: «No se pudo eliminar la cuenta x: User not found».
  const mixto = mensaje.match(/^(.*[áéíóúñ].*?|.*\b(?:No se|no se)\b.*?):\s+(.+)$/s)
  if (mixto && pareceIngles(mixto[2])) {
    const detalle = traducirError(mixto[2], '')
    return detalle ? `${mixto[1].replace(/[.\s]+$/, '')}: ${detalle.charAt(0).toLowerCase()}${detalle.slice(1)}` : `${mixto[1].replace(/[.\s]+$/, '')}.`
  }
  for (const [patron, traduccion] of POR_MENSAJE) {
    const coincidencia = mensaje.match(patron)
    if (coincidencia) return typeof traduccion === 'function' ? traduccion(coincidencia) : traduccion
  }
  if (pareceIngles(mensaje)) {
    console.warn('[PresupuestAR] Error sin traducir:', mensaje)
    return generico
  }
  return mensaje
}

const codigoDe = (e: unknown): string | undefined =>
  e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' && e.code ? e.code : undefined

/** Mensaje en castellano para cualquier error, con un texto genérico de respaldo. */
export function mensajeError(e: unknown, generico = 'No se pudo completar la operación. Probá de nuevo.'): string {
  const codigo = codigoDe(e)
  if (e instanceof Error) return e.message || codigo ? traducirError(e.message, generico, codigo) : generico
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return traducirError(e.message, generico, codigo)
  if (typeof e === 'string' && e) return traducirError(e, generico)
  return generico
}

/**
 * Las Edge Functions devuelven `{ error }` con el motivo real, pero supabase-js lo
 * reemplaza por "Edge Function returned a non-2xx status code". Recupera el motivo.
 */
export async function errorDeFuncion(error: unknown, generico = 'No se pudo completar la operación. Probá de nuevo.'): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const respuesta = error.context as Response
      const texto = await respuesta.clone().text()
      if (texto) {
        try {
          const cuerpo: unknown = JSON.parse(texto)
          if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && typeof cuerpo.error === 'string') {
            return new Error(traducirError(cuerpo.error, generico, codigoDe(cuerpo)))
          }
          if (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo && typeof cuerpo.message === 'string') {
            return new Error(traducirError(cuerpo.message, generico, codigoDe(cuerpo)))
          }
        } catch { /* no es JSON */ }
        return new Error(traducirError(texto, generico))
      }
      if (respuesta.status === 401) return new Error(SESION_VENCIDA)
      if (respuesta.status === 403) return new Error(SIN_PERMISO)
      return new Error(generico)
    } catch { /* sin cuerpo legible */ }
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return new Error(SIN_CONEXION)
  return new Error(mensajeError(error, generico))
}
