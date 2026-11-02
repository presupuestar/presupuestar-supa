import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SesionProvider, useSesion } from './context/Sesion'
import type { PermisoEmpresa } from './lib/tipos'

const Login = lazy(() => import('./pages/Login').then(({ Login }) => ({ default: Login })))
const Inicio = lazy(() => import('./pages/Inicio').then(({ Inicio }) => ({ default: Inicio })))
const Catalogo = lazy(() => import('./pages/Catalogo').then(({ Catalogo }) => ({ default: Catalogo })))
const NuevoPresupuesto = lazy(() => import('./pages/NuevoPresupuesto').then(({ NuevoPresupuesto }) => ({ default: NuevoPresupuesto })))
const Historial = lazy(() => import('./pages/Historial').then(({ Historial }) => ({ default: Historial })))
const Equipo = lazy(() => import('./pages/Equipo').then(({ Equipo }) => ({ default: Equipo })))
const PropietarioSupabase = lazy(() => import('./pages/PropietarioSupabase').then(({ PropietarioSupabase }) => ({ default: PropietarioSupabase })))
const RecuperarClave = lazy(() => import('./pages/RecuperarClave').then(({ RecuperarClave }) => ({ default: RecuperarClave })))
const RestablecerClave = lazy(() => import('./pages/RestablecerClave').then(({ RestablecerClave }) => ({ default: RestablecerClave })))
const Clientes = lazy(() => import('./pages/Clientes').then(({ Clientes }) => ({ default: Clientes })))

function CargandoPantalla() {
  return <main className="cargando-pantalla" role="status"><span className="indicador-carga" aria-hidden="true" />Cargando pantalla…</main>
}

function Protegida({ children, permiso, cualquiera }: {
  children: React.ReactNode
  permiso?: PermisoEmpresa
  cualquiera?: PermisoEmpresa[]
}) {
  const { usuario, cargando, salir } = useSesion()
  if (cargando) return null
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.rol === 'propietario') return <Navigate to="/login" replace />
  if (permiso && !usuario.permisos.includes(permiso) && usuario.rol !== 'admin') {
    return <main className="contenido"><h1>Sin permiso</h1><p className="sub">Pedile al administrador de tu empresa que te habilite esta función.</p></main>
  }
  if (cualquiera && usuario.rol !== 'admin' && !cualquiera.some((p) => usuario.permisos.includes(p))) {
    return <main className="contenido"><h1>Sin permiso</h1><p className="sub">Pedile al administrador de tu empresa que te habilite esta función.</p></main>
  }
  if (!usuario.empresa) {
    return (
      <main className="contenido">
        <h1>Tu usuario no tiene una empresa asignada</h1>
        <p className="sub">Pedile al administrador que te asigne una empresa y volvé a ingresar.</p>
        <button className="btn chico" onClick={salir}>Salir</button>
      </main>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Suspense fallback={<CargandoPantalla />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/recuperar" element={<RecuperarClave />} />
            <Route path="/restablecer" element={<RestablecerClave />} />
            <Route path="/" element={<Protegida><Inicio /></Protegida>} />
            <Route path="/catalogo" element={<Protegida permiso="catalog.view"><Catalogo /></Protegida>} />
            <Route path="/nuevo" element={<Protegida permiso="quotes.create"><NuevoPresupuesto /></Protegida>} />
            <Route path="/presupuestos/:id/editar" element={<Protegida cualquiera={['quotes.update_own']}><NuevoPresupuesto /></Protegida>} />
            <Route path="/historial" element={<Protegida cualquiera={['quotes.view_own', 'quotes.view_all']}><Historial /></Protegida>} />
            <Route path="/clientes" element={<Protegida permiso="clients.manage"><Clientes /></Protegida>} />
            <Route path="/equipo" element={<Protegida><Equipo /></Protegida>} />
            <Route path="/propietario" element={<PropietarioSupabase />} />
            <Route path="/propietario/empresas/:id" element={<PropietarioSupabase />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SesionProvider>
  )
}
