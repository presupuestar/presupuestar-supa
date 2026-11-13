const MINUSCULAS = 'abcdefghjkmnpqrstuvwxyz'
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMEROS = '23456789'
const SIMBOLOS = '#$%*+-?@'

/** Índice al azar sin sesgo de módulo. */
function azar(max: number): number {
  const limite = Math.floor(256 / max) * max
  const buffer = new Uint8Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0] >= limite)
  return buffer[0] % max
}

/**
 * Contraseña aleatoria de fácil lectura (sin 0/O ni 1/l/I) para pasársela a un empleado.
 * Siempre incluye minúscula, mayúscula, número y símbolo, para cumplir la política
 * de contraseñas más estricta que permite Supabase Auth.
 */
export function generarClave(largo = 16): string {
  const todos = MINUSCULAS + MAYUSCULAS + NUMEROS + SIMBOLOS
  const caracteres = [MINUSCULAS, MAYUSCULAS, NUMEROS, SIMBOLOS].map((grupo) => grupo[azar(grupo.length)])
  while (caracteres.length < largo) caracteres.push(todos[azar(todos.length)])
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = azar(i + 1)
    ;[caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]]
  }
  return caracteres.join('')
}
