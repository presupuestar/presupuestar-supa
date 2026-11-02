import { repositorio } from '../lib/repositorio'
import type { Empresa } from '../lib/tipos'

/** Logo de la empresa; si no subió uno, su inicial sobre el color primario. */
export function MarcaEmpresa({ empresa, size = 40 }: { empresa: Empresa; size?: number }) {
  const logo = repositorio.empresa.archivoUrl(empresa, empresa.logo)
  return (
    <span className="marca">
      {logo
        ? <img src={logo} alt={empresa.nombre} style={{ height: size }} />
        : <span className="inicial" style={{ width: size, height: size, fontSize: size * 0.5 }}>{empresa.nombre[0]}</span>}
      {!logo && <strong>{empresa.nombre}</strong>}
    </span>
  )
}
