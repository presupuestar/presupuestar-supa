import { Link } from 'react-router-dom'
import { repositorio } from '../lib/repositorio'
import type { Empresa } from '../lib/tipos'

/**
 * Logo de la empresa (o su inicial sobre el color primario) y su nombre al lado,
 * para que cada persona sepa siempre en qué empresa está trabajando.
 */
export function MarcaEmpresa({ empresa, size = 40 }: { empresa: Empresa; size?: number }) {
  const logo = repositorio.empresa.archivoUrl(empresa, empresa.logo)
  return (
    <Link to="/" className="marca marca-empresa" aria-label={`${empresa.nombre} · Inicio`}>
      {logo
        ? <img src={logo} alt="" style={{ height: size }} />
        : <span className="inicial" style={{ width: size, height: size, fontSize: size * 0.5 }}>{empresa.nombre[0]}</span>}
      <strong className="marca-empresa-nombre">{empresa.nombre}</strong>
    </Link>
  )
}
