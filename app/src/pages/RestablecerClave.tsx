import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Isotipo } from '../components/Isotipo'
import { supabase, supabasePropietario } from '../lib/supabase'

export function RestablecerClave() {
  const navigate = useNavigate()
  const propietario = new URLSearchParams(window.location.search).get('owner') === '1'
  const auth = propietario ? supabasePropietario : supabase
  const [listo, setListo] = useState(false)
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    const { data: listener } = auth.auth.onAuthStateChange((event, session) => {
      if (vigente && event === 'PASSWORD_RECOVERY' && session) setListo(true)
    })
    const parametros = new URLSearchParams(window.location.search)
    const code = parametros.get('code')
    const fragmento = new URLSearchParams(window.location.hash.slice(1))
    const tipoRecuperacion = fragmento.get('type') === 'recovery'
    const recoveryLink = Boolean(code) || tipoRecuperacion
    const cargarSesionRecuperacion = async () => {
      if (!recoveryLink) return
      if (code) {
        const { data, error: exchangeError } = await auth.auth.exchangeCodeForSession(code)
        if (exchangeError) throw exchangeError
        if (vigente && data.session) setListo(true)
        return
      }
      const accessToken = fragmento.get('access_token')
      const refreshToken = fragmento.get('refresh_token')
      if (tipoRecuperacion && accessToken && refreshToken) {
        const { data, error: sessionError } = await auth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (sessionError) throw sessionError
        if (vigente && data.session) setListo(true)
        return
      }
      const { data, error: sessionError } = await auth.auth.getSession()
      if (sessionError) throw sessionError
      if (vigente && data.session) setListo(true)
    }
    cargarSesionRecuperacion().catch((reason: unknown) => {
      if (vigente) setError(reason instanceof Error ? reason.message : 'El enlace no es válido.')
    })
    return () => {
      vigente = false
      listener.subscription.unsubscribe()
    }
  }, [auth])

  const guardar = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave !== confirmacion) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    try {
      const { error: updateError } = await auth.auth.updateUser({ password: clave })
      if (updateError) throw updateError
      await auth.auth.signOut({ scope: 'local' })
      navigate(propietario ? '/propietario' : '/login', { replace: true })
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
            <Link className="link" to={propietario ? '/recuperar?owner=1' : '/recuperar'}>Solicitar otro enlace</Link>
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
