import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SesionProvider, useSesion } from './context/Sesion'
import { Login } from './pages/Login'
import { Inicio } from './pages/Inicio'
import { Catalogo } from './pages/Catalogo'
import { NuevoPresupuesto } from './pages/NuevoPresupuesto'
import { Historial } from './pages/Historial'
import { Equipo } from './pages/Equipo'
import { PropietarioSupabase } from './pages/PropietarioSupabase'
import { RecuperarClave } from './pages/RecuperarClave'
import { RestablecerClave } from './pages/RestablecerClave'

function Protegida({ children }: { children: React.ReactNode }) {
  const { usuario, cargando, salir } = useSesion()
  if (cargando) return null
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.rol === 'propietario') return <Navigate to="/propietario" replace />
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/recuperar" element={<RecuperarClave />} />
          <Route path="/restablecer" element={<RestablecerClave />} />
          <Route path="/" element={<Protegida><Inicio /></Protegida>} />
          <Route path="/catalogo" element={<Protegida><Catalogo /></Protegida>} />
          <Route path="/nuevo" element={<Protegida><NuevoPresupuesto /></Protegida>} />
          <Route path="/presupuestos/:id/editar" element={<Protegida><NuevoPresupuesto /></Protegida>} />
          <Route path="/historial" element={<Protegida><Historial /></Protegida>} />
          <Route path="/equipo" element={<Protegida><Equipo /></Protegida>} />
          <Route path="/propietario" element={<PropietarioSupabase />} />
          <Route path="/propietario/empresas/:id" element={<PropietarioSupabase />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  )
}
