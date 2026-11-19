/** Color fijo por persona: el mismo en el historial, el equipo y los gráficos de ventas. */
export function colorPersona(clave: string): number {
  let h = 0
  for (const c of clave.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (h % 8) + 1
}

const iniciales = (nombre: string) => {
  const partes = nombre.replace(/@.*/, '').trim().split(/[\s._-]+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/** Círculo con las iniciales de la persona, del color que le toca. */
export function Iniciales({ nombre, clave, chico }: { nombre: string; clave?: string; chico?: boolean }) {
  return (
    <span className={`iniciales color-${colorPersona(clave || nombre)}${chico ? ' chico' : ''}`} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  )
}
