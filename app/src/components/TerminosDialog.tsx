import { useEffect, useRef, useState } from 'react'
import { useSesion } from '../context/Sesion'
import { mensajeError } from '../lib/errores'
import { Privacidad, Terminos } from './EnlacesLegales'

/**
 * En el primer ingreso, el usuario tiene que leer y aceptar los términos y la política
 * de privacidad antes de usar la app. No se puede cerrar sin aceptar (solo salir).
 */
export function TerminosDialog() {
  const { usuario, aceptarTerminos, salir } = useSesion()
  const ref = useRef<HTMLDialogElement>(null)
  const [leido, setLeido] = useState(false)
  const [acepto, setAcepto] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const pendiente = Boolean(usuario && !usuario.terminosAceptados)

  useEffect(() => {
    if (pendiente && ref.current && !ref.current.open) ref.current.showModal()
    if (!pendiente && ref.current?.open) ref.current.close()
  }, [pendiente])

  if (!pendiente) return null

  const aceptar = async () => {
    setError('')
    setGuardando(true)
    try {
      await aceptarTerminos()
    } catch (e) {
      setError(mensajeError(e, 'No se pudo registrar la aceptación. Probá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <dialog ref={ref} className="ventana legal terminos-dialog" aria-labelledby="terminos-titulo" onCancel={(e) => e.preventDefault()}>
      <div className="form">
        <h2 id="terminos-titulo">Antes de empezar</h2>
        <p className="sub">Leé los términos y la política de privacidad de PresupuestAR. Para usar la app tenés que aceptarlos.</p>
        <div
          className="texto-legal terminos-scroll"
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setLeido(true)
          }}
          ref={(el) => { if (el && el.scrollHeight <= el.clientHeight + 24) setLeido(true) }}
        >
          <Terminos nivel={3} />
          <Privacidad nivel={3} />
        </div>
        {!leido && <p className="ayuda">Bajá hasta el final del texto para poder aceptarlo.</p>}
        <label className="check">
          <input type="checkbox" checked={acepto} disabled={!leido || guardando} onChange={(e) => setAcepto(e.target.checked)} />
          Leí y acepto los términos y condiciones y la política de privacidad.
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button type="button" className="btn sec chico" disabled={guardando} onClick={salir}>Salir</button>
          <button type="button" className="btn chico" disabled={!acepto || guardando} onClick={() => void aceptar()}>{guardando ? 'Guardando…' : 'Aceptar y continuar'}</button>
        </div>
      </div>
    </dialog>
  )
}
