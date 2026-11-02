import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Isotipo } from '../components/Isotipo'
import { supabase } from '../lib/supabase'

export function RestablecerClave() {
  const navigate = useNavigate()
  const [listo, setListo] = useState(false)
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (vigente && event === 'PASSWORD_RECOVERY' && session) setListo(true)
    })
    const recoveryLink = new URLSearchParams(window.location.search).has('code')
      || new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
    if (recoveryLink) {
      supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (!vigente) return
        if (sessionError) setError(sessionError.message)
        else if (data.session) setListo(true)
      }).catch((reason: unknown) => {
        if (vigente) setError(reason instanceof Error ? reason.message : 'El enlace no es válido.')
      })
    }
    return () => {
      vigente = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const guardar = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave !== confirmacion) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: clave })
      if (updateError) throw updateError
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="login">
      <section className="login-lado">
        <span className="marca"><Isotipo size={44} tile="#1F6FEB" /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
        <h1>Elegí una contraseña nueva.</h1>
        <p>Usá al menos 8 caracteres y no la compartas con nadie.</p>
      </section>
      <section className="login-form">
        {!listo ? (
          <div className="form">
            <h2>Enlace pendiente o vencido</h2>
            <p>{error || 'Abrí el enlace más reciente que recibiste. Si venció, solicita uno nuevo.'}</p>
            <Link className="link" to="/recuperar">Solicitar otro enlace</Link>
          </div>
        ) : (
          <form onSubmit={guardar}>
            <h2>Cambiar contraseña</h2>
            <label>Nueva contraseña
              <input type="password" value={clave} onChange={(event) => setClave(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label>Repetir contraseña
              <input type="password" value={confirmacion} onChange={(event) => setConfirmacion(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar contraseña'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
