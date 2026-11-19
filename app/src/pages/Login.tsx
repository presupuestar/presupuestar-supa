import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useSesion } from '../context/Sesion'
import { Isotipo } from '../components/Isotipo'
import { EnlacesLegales } from '../components/EnlacesLegales'
import { mensajeError } from '../lib/errores'

export function Login() {
  const { usuario, entrar, errorEmpresa } = useSesion()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario && usuario.rol !== 'propietario') return <Navigate to="/" replace />

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    setError(''); setEnviando(true)
    try { await entrar(email.trim(), clave) }
    catch (e) { setError(mensajeError(e, 'No se pudo iniciar sesión.')) }
    finally { setEnviando(false) }
  }

  return (
    <main className="login">
      <section className="login-lado">
        <span className="marca"><Isotipo size={44} tile="#1F6FEB" /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
        <h1>Presupuestos profesionales en 1 minuto.</h1>
        <p>Cargá tus servicios una vez y armá cada presupuesto con los datos de tu cliente.</p>
        <div className="login-ilustracion" aria-hidden="true">
          <div className="hoja hoja-atras" />
          <div className="hoja">
            <div className="hoja-cabeza"><span className="hoja-logo" /><span><i className="l70" /><i className="l45" /></span><small>N.º 0128</small></div>
            <div className="hoja-fila"><i className="l60" /><b>$ 185.000,00</b></div>
            <div className="hoja-fila"><i className="l45" /><b>$ 62.500,00</b></div>
            <div className="hoja-fila"><i className="l55" /><b>$ 40.000,00</b></div>
            <div className="hoja-total"><span>Total</span><strong>$ 287.500,00</strong></div>
            <span className="hoja-sello">Aceptado</span>
          </div>
        </div>
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
          {(error || errorEmpresa) && <p className="error" role="alert">{error || errorEmpresa}</p>}
          <button className="btn" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
          <EnlacesLegales />
        </form>
      </section>
    </main>
  )
}
