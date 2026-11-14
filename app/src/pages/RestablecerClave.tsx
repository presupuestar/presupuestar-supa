import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Isotipo } from '../components/Isotipo'
import { supabase, supabasePropietario } from '../lib/supabase'
import { mensajeError } from '../lib/errores'

const intentosRecuperacion = new Map<string, Promise<boolean>>()

export function RestablecerClave() {
  const navigate = useNavigate()
  const propietario = new URLSearchParams(window.location.search).get('owner') === '1'
  const auth = propietario ? supabasePropietario : supabase
  const [listo, setListo] = useState(false)
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  // La dirección con los tokens se lee una sola vez, antes de limpiarla.
  const [enlace] = useState(() => ({ search: window.location.search, hash: window.location.hash }))

  useEffect(() => {
    let vigente = true
    const { data: listener } = auth.auth.onAuthStateChange((event, session) => {
      if (vigente && event === 'PASSWORD_RECOVERY' && session) setListo(true)
    })
    const parametros = new URLSearchParams(enlace.search)
    const code = parametros.get('code')
    const fragmento = new URLSearchParams(enlace.hash.slice(1))
    const tipoRecuperacion = fragmento.get('type') === 'recovery'
    const recoveryLink = Boolean(code) || tipoRecuperacion
    // El enlace trae tokens de un solo uso en la dirección: se quitan enseguida para que
    // no queden en el historial del navegador ni se compartan si alguien copia la URL.
    if (recoveryLink) window.history.replaceState(null, '', `${window.location.pathname}${propietario ? '?owner=1' : ''}`)
    const cargarSesionRecuperacion = () => {
      // El código del enlace es de un solo uso: si el efecto corre dos veces, se reutiliza el mismo intento.
      const clave = `${enlace.search}${enlace.hash}`
      let intento = intentosRecuperacion.get(clave)
      if (!intento) {
        intento = procesarEnlace()
        intentosRecuperacion.set(clave, intento)
      }
      return intento.then((ok) => { if (vigente && ok) setListo(true) })
    }
    const procesarEnlace = async (): Promise<boolean> => {
      if (!recoveryLink) return false
      if (code) {
        const { data, error: exchangeError } = await auth.auth.exchangeCodeForSession(code)
        if (exchangeError) throw exchangeError
        return Boolean(data.session)
      }
      const accessToken = fragmento.get('access_token')
      const refreshToken = fragmento.get('refresh_token')
      if (tipoRecuperacion && accessToken && refreshToken) {
        const { data, error: sessionError } = await auth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (sessionError) throw sessionError
        return Boolean(data.session)
      }
      const { data, error: sessionError } = await auth.auth.getSession()
      if (sessionError) throw sessionError
      return Boolean(data.session)
    }
    cargarSesionRecuperacion().catch((reason: unknown) => {
      if (vigente) setError(mensajeError(reason, 'El enlace no es válido o venció.'))
    })
    return () => {
      vigente = false
      listener.subscription.unsubscribe()
    }
  }, [auth, enlace, propietario])

  const guardar = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave.length > 72) return setError('La contraseña puede tener hasta 72 caracteres.')
    if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) return setError('Combiná letras y números en la contraseña.')
    if (clave !== confirmacion) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    try {
      const { error: updateError } = await auth.auth.updateUser({ password: clave })
      if (updateError) throw updateError
      // Cierra todas las sesiones abiertas de la cuenta (otros dispositivos incluidos):
      // si alguien tenía acceso con la contraseña anterior, lo pierde.
      const { error: salidaError } = await auth.auth.signOut({ scope: 'global' })
      if (salidaError) await auth.auth.signOut({ scope: 'local' })
      navigate(propietario ? '/propietario' : '/login', { replace: true })
    } catch (reason) {
      setError(mensajeError(reason, 'No se pudo cambiar la contraseña.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="login">
      <section className="login-lado">
        <span className="marca"><Isotipo size={44} tile="#1F6FEB" /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
        <h1>Elegí una contraseña nueva.</h1>
        <p>Usá al menos 8 caracteres, con letras y números, y no la compartas con nadie. Al guardarla se cierra tu sesión en todos los dispositivos.</p>
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
