import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Isotipo } from '../components/Isotipo'
import { supabase } from '../lib/supabase'

export function RecuperarClave() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/restablecer`,
      })
      if (resetError) throw resetError
      setEnviado(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo enviar el correo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <section className="login-lado">
        <span className="marca"><Isotipo size={44} tile="#1F6FEB" /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
        <h1>Recuperá tu contraseña.</h1>
        <p>Te enviaremos un enlace para elegir una contraseña nueva.</p>
      </section>
      <section className="login-form">
        {enviado ? (
          <div className="form">
            <h2>Revisá tu correo</h2>
            <p>Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.</p>
            <Link className="link" to="/login">Volver a ingresar</Link>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <h2>Recuperar acceso</h2>
            <label>Correo electrónico
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
            <Link className="link" to="/login">Volver a ingresar</Link>
          </form>
        )}
      </section>
    </main>
  )
}
