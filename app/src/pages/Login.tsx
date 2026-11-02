import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useSesion } from '../context/Sesion'
import { Isotipo } from '../components/Isotipo'
import { PreferenciasVisuales } from '../components/PreferenciasVisuales'

export function Login() {
  const { usuario, entrar } = useSesion()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario && usuario.rol !== 'propietario') return <Navigate to="/" replace />

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    setError(''); setEnviando(true)
    try { await entrar(email, clave) }
    catch { setError('Correo o contraseña incorrectos.') }
    finally { setEnviando(false) }
  }

  return (
    <main className="login">
      <div className="login-theme"><PreferenciasVisuales /></div>
      <section className="login-lado">
        <span className="marca"><Isotipo size={44} tile="#1F6FEB" /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
        <h1>Presupuestos profesionales en 1 minuto.</h1>
        <p>Cargá tus servicios una vez y armá cada presupuesto con los datos de tu cliente.</p>
      </section>
      <section className="login-form">
        <form onSubmit={enviar}>
          <h2>Ingresá a tu cuenta</h2>
          <label>Correo electrónico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>Contraseña
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
          </label>
          <Link className="link" to="/recuperar">¿Olvidaste tu contraseña?</Link>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </section>
    </main>
  )
}
