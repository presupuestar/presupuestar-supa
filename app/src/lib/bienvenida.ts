import { faltaUrlPublica, urlPublica } from './urlPublica'

/**
 * Mensajes listos para mandarle a una persona nueva (por WhatsApp o correo) con
 * sus datos de acceso. Los usan el administrador de la empresa y el propietario.
 */
interface Datos {
  nombre?: string
  empresa?: string
  email: string
  clave: string
  /** 'admin' para quien administra la empresa; cualquier otro valor es parte del equipo. */
  rol?: string
}

const saludo = (nombre?: string) => {
  const primero = (nombre ?? '').trim().split(/\s+/)[0]
  return primero ? `¡Hola, ${primero}!` : '¡Hola!'
}

export function mensajeBienvenida({ nombre, empresa, email, clave, rol }: Datos): string {
  const deEmpresa = empresa?.trim() ? ` de ${empresa.trim()}` : ''
  const queHace = rol === 'admin'
    ? `Ya tenés tu cuenta para administrar los presupuestos${deEmpresa}: vas a poder cargar el catálogo, armar presupuestos y sumar a tu equipo.`
    : `Ya tenés tu cuenta para armar y enviar presupuestos${deEmpresa}.`
  return [
    `${saludo(nombre)} Te damos la bienvenida a PresupuestAR.`,
    queHace,
    '',
    'Para entrar:',
    `• Dirección: ${urlPublica()}`,
    `• Correo: ${email}`,
    `• Contraseña: ${clave}`,
    '',
    'La primera vez que entres te vamos a ofrecer cambiar la contraseña por una tuya. Guardá este mensaje hasta entonces.',
  ].join('\n')
}

export function mensajeClaveNueva({ nombre, email, clave }: Datos): string {
  return [
    `${saludo(nombre)} Te cambiamos la contraseña de PresupuestAR.`,
    '',
    `• Dirección: ${urlPublica()}`,
    `• Correo: ${email}`,
    `• Contraseña nueva: ${clave}`,
  ].join('\n')
}

/** Advertencia para mostrar junto a los datos: no se vuelven a ver y, en local, el enlace no sirve afuera. */
export function advertenciaAcceso(): string {
  const base = 'La contraseña no se vuelve a mostrar: copiá el mensaje ahora y mandalo por un canal privado.'
  return faltaUrlPublica()
    ? `${base} Ojo: estás en localhost, así que la dirección solo funciona en esta computadora. Cambiala por la de la web publicada antes de mandarlo.`
    : base
}
