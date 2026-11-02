/** Contraseña aleatoria de fácil lectura (sin 0/O ni 1/l/I) para pasársela a un empleado. */
export function generarClave(largo = 16): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const limite = Math.floor(256 / letras.length) * letras.length
  const caracteres: string[] = []
  while (caracteres.length < largo) {
    const azar = crypto.getRandomValues(new Uint8Array(Math.max(32, largo - caracteres.length)))
    for (const valor of azar) {
      if (valor < limite) caracteres.push(letras[valor % letras.length])
      if (caracteres.length === largo) break
    }
  }
  return caracteres.join('')
}
