import { useEffect, useState } from 'react'
import { aplicarTemaVisual, temaEfectivo } from '../lib/temaVisual'

/** Alterna entre modo claro y oscuro (sol / luna). */
export function BotonTema({ conTexto = false }: { conTexto?: boolean }) {
  const [tema, setTema] = useState(temaEfectivo)

  useEffect(() => {
    // Si se usa el modo del sistema y cambia (por ejemplo, de día a noche), se actualiza el ícono.
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const actualizar = () => setTema(temaEfectivo())
    consulta.addEventListener('change', actualizar)
    return () => consulta.removeEventListener('change', actualizar)
  }, [])

  const siguiente = tema === 'oscuro' ? 'claro' : 'oscuro'
  const etiqueta = siguiente === 'oscuro' ? 'Activar modo oscuro' : 'Activar modo claro'
  return (
    <button
      type="button"
      className={`boton-tema${conTexto ? ' con-texto' : ''}`}
      aria-label={etiqueta}
      title={etiqueta}
      onClick={(e) => { e.stopPropagation(); aplicarTemaVisual(siguiente); setTema(siguiente) }}
    >
      <span className={`boton-tema-icono ${tema === 'oscuro' ? 'sol' : 'luna'}`} aria-hidden="true" />
      {conTexto && <span>{siguiente === 'oscuro' ? 'Modo oscuro' : 'Modo claro'}</span>}
    </button>
  )
}
