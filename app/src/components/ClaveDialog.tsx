import { useEffect, useRef, useState, type FormEvent } from 'react'
import { generarClave } from '../lib/clave'
import { mensajeError } from '../lib/errores'

interface Props { titulo: string; alCerrar: () => void; alGuardar: (clave: string) => Promise<void> }

/** Ventana para fijar una contraseña nueva; permite generar una al azar. */
export function ClaveDialog({ titulo, alCerrar, alGuardar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [clave, setClave] = useState(generarClave())
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { ref.current?.showModal() }, [])

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setError(''); setGuardando(true)
    try { await alGuardar(clave); ref.current?.close() }
    catch (e) { setError(mensajeError(e, 'No se pudo cambiar la contraseña.')); setGuardando(false) }
  }

  return (
    <dialog ref={ref} onClose={alCerrar} onClick={(e) => { if (e.target === ref.current) ref.current?.close() }}>
      <form onSubmit={enviar} className="form">
        <h2>{titulo}</h2>
        <label className="campo">Contraseña nueva
          <input value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <button type="button" className="link" onClick={() => setClave(generarClave())}>Generar otra</button>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button type="button" className="btn sec chico" onClick={() => ref.current?.close()}>Cancelar</button>
          <button className="btn chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </dialog>
  )
}
