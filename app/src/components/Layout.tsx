import { BotonTema } from './BotonTema'
import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { tienePermiso, useSesion } from '../context/Sesion'
import { MarcaEmpresa } from './MarcaEmpresa'
import { SelloPresupuestar } from './Isotipo'
import { PrimerAccesoDialog } from './PrimerAccesoDialog'
import { TerminosDialog } from './TerminosDialog'
import { EnlacesLegales } from './EnlacesLegales'

const clase = ({ isActive }: { isActive: boolean }) => (isActive ? 'activo' : '')

/** Barra superior + pie, compartidos por todas las pantallas internas. */
export function Layout({ children }: { children: ReactNode }) {
  const { usuario, empresa, salir } = useSesion()
  const [menuAbierto, setMenuAbierto] = useState(false)
  return (
    <div className="app">
      <header className="barra">
        {empresa && <MarcaEmpresa empresa={empresa} size={34} />}
        <button className="menu-toggle" type="button" aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuAbierto} aria-controls="navegacion-principal" onClick={() => setMenuAbierto(!menuAbierto)}>
          <span /><span /><span />
        </button>
        <nav id="navegacion-principal" className={menuAbierto ? 'menu-abierto' : ''} aria-label="Principal" onClick={() => setMenuAbierto(false)}>
          <NavLink to="/" end className={clase}>Inicio</NavLink>
          <NavLink to="/catalogo" className={clase}>Catálogo</NavLink>
          <NavLink to="/nuevo" className={clase}>Nuevo presupuesto</NavLink>
          <NavLink to="/historial" className={clase}>Historial</NavLink>
          {tienePermiso(usuario, 'clients.manage') && <NavLink to="/clientes" className={clase}>Clientes</NavLink>}
          {usuario?.rol === 'admin' && <NavLink to="/equipo" className={clase}>Equipo</NavLink>}
          <span className="menu-usuario">
            <span className="menu-usuario-correo">{usuario?.email}</span>
            <BotonTema />
            <button type="button" className="btn sec chico" onClick={salir}>Salir</button>
          </span>
        </nav>
        <span className="usuario"><BotonTema /><span className="usuario-correo" title={usuario?.email}>{usuario?.email}</span><button type="button" className="salir" onClick={salir}>Salir</button></span>
      </header>
      {children}
      {usuario?.terminosAceptados ? <PrimerAccesoDialog /> : <TerminosDialog />}
      <footer className="pie">
        {empresa?.mostrarSello !== false && <SelloPresupuestar />}
        <EnlacesLegales />
      </footer>
    </div>
  )
}
