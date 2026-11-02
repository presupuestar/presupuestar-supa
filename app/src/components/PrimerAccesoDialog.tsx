import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSesion } from '../context/Sesion'
import { mensajeError } from '../lib/errores'

export function PrimerAccesoDialog() {
  const { usuario, resolverPrimerAcceso } = useSesion()
  const ref = useRef<HTMLDialogElement>(null)
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [verConfirmacion, setVerConfirmacion] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const pendiente = Boolean(usuario && usuario.primerAccesoClaveRespondido !== true)

  useEffect(() => {
    if (pendiente && ref.current && !ref.current.open) ref.current.showModal()
    if (!pendiente && ref.current?.open) ref.current.close()
  }, [pendiente])

  if (!pendiente) return null

  const responder = async (nuevaClave?: string) => {
    setError('')
    setGuardando(true)
    try {
      await resolverPrimerAcceso(nuevaClave)
      ref.current?.close()
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la respuesta. Probá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave !== confirmacion) return setError('Las contraseñas no coinciden.')
    await responder(clave)
  }

  return (
    <dialog ref={ref} className="primer-acceso-dialog" onCancel={(e) => { e.preventDefault(); void responder() }} onClick={(e) => { if (e.target === ref.current) void responder() }}>
      <form onSubmit={enviar} className="form">
        <button className="primer-acceso-cerrar" type="button" aria-label="Cerrar" title="Cerrar" disabled={guardando} onClick={() => void responder()}>×</button>
        <h2>¿Querés cambiar tu contraseña?</h2>
        <p className="sub">Podés actualizarla ahora o continuar con la actual.</p>
        <label className="campo">Nueva contraseña
          <span className="campo-password-primer">
            <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72} disabled={guardando} />
            <button className="ojo-password" type="button" aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVerClave(!verClave)}><span aria-hidden="true" /></button>
          </span>
        </label>
        <label className="campo">Repetir contraseña
          <span className="campo-password-primer">
            <input type={verConfirmacion ? 'text' : 'password'} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72} disabled={guardando} />
            <button className="ojo-password" type="button" aria-label={verConfirmacion ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verConfirmacion ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVerConfirmacion(!verConfirmacion)}><span aria-hidden="true" /></button>
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button type="button" className="btn sec chico" disabled={guardando} onClick={() => void responder()}>Denegar</button>
          <button className="btn chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Aceptar'}</button>
        </div>
      </form>
    </dialog>
  )
}