/**
 * Dirección pública de la app (la de Vercel). Se usa en los datos de acceso que se
 * le pasan a un empleado y en los enlaces de recuperación de contraseña, para que
 * nunca apunten a localhost aunque el administrador esté trabajando en local.
 */
const configurada = String(import.meta.env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '')

export const esLocal = (origen: string) => /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origen)

export function urlPublica(): string {
  return configurada || window.location.origin
}

/** true si la app no sabe su dirección pública y se está usando desde localhost. */
export const faltaUrlPublica = () => !configurada && esLocal(window.location.origin)
