/** Contraseña aleatoria de fácil lectura (sin 0/O ni 1/l/I) para pasársela a un empleado. */
export function generarClave(largo = 10): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const azar = new Uint32Array(largo)
  crypto.getRandomValues(azar)
  return Array.from(azar, (n) => letras[n % letras.length]).join('')
}
