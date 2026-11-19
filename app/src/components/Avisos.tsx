import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { cerrarConFondo } from '../lib/dialogo'

/**
 * Reemplazos con el diseño de la app para confirm() y alert() del navegador:
 * - confirmar(): ventana con Cancelar / acción (por ejemplo «Eliminar»).
 * - mostrarDatos(): ventana con datos para copiar (accesos con contraseña).
 * - avisar(): aviso breve abajo de la pantalla que se va solo.
 */

interface OpcionesConfirmar {
  titulo: string
  mensaje?: string
  confirmar?: string
  cancelar?: string
  peligro?: boolean
}

interface OpcionesDatos {
  titulo: string
  mensaje?: string
  datos: string
  advertencia?: string
}

type TipoAviso = 'ok' | 'error' | 'info'

interface Valor {
  confirmar: (opciones: OpcionesConfirmar) => Promise<boolean>
  mostrarDatos: (opciones: OpcionesDatos) => Promise<void>
  avisar: (texto: string, tipo?: TipoAviso) => void
}

const Ctx = createContext<Valor | null>(null)

export const useAvisos = () => {
  const valor = useContext(Ctx)
  if (!valor) throw new Error('useAvisos debe usarse dentro de <AvisosProvider>')
  return valor
}

interface Aviso { id: number; texto: string; tipo: TipoAviso; saliendo?: boolean }

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<(OpcionesConfirmar & { resolver: (ok: boolean) => void }) | null>(null)
  const [datos, setDatos] = useState<(OpcionesDatos & { resolver: () => void }) | null>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(1)

  // Si aparece un error fuera de la vista (por ejemplo al final de un formulario largo),
  // se lleva la pantalla hasta él para que no pase desapercibido.
  useEffect(() => {
    const observador = new MutationObserver((cambios) => {
      for (const cambio of cambios) for (const nodo of cambio.addedNodes) {
        if (!(nodo instanceof HTMLElement)) continue
        const error = nodo.matches('.error[role=alert]') ? nodo : nodo.querySelector<HTMLElement>('.error[role=alert]')
        if (!error || error.closest('dialog, .barra-total')) continue
        const caja = error.getBoundingClientRect()
        if (caja.top < 70 || caja.bottom > window.innerHeight - 20) error.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    })
    observador.observe(document.body, { childList: true, subtree: true })
    return () => observador.disconnect()
  }, [])

  const confirmar = useCallback((opciones: OpcionesConfirmar) =>
    new Promise<boolean>((resolver) => setPedido({ ...opciones, resolver })), [])

  const mostrarDatos = useCallback((opciones: OpcionesDatos) =>
    new Promise<void>((resolver) => setDatos({ ...opciones, resolver })), [])

  const avisar = useCallback((texto: string, tipo: TipoAviso = 'ok') => {
    const id = siguiente.current++
    setAvisos((actuales) => [...actuales.slice(-2), { id, texto, tipo }])
    window.setTimeout(() => setAvisos((actuales) => actuales.map((a) => a.id === id ? { ...a, saliendo: true } : a)), 3400)
    window.setTimeout(() => setAvisos((actuales) => actuales.filter((a) => a.id !== id)), 3700)
  }, [])

  return (
    <Ctx.Provider value={{ confirmar, mostrarDatos, avisar }}>
      {children}
      {pedido && <VentanaConfirmar {...pedido} alResponder={(ok) => { pedido.resolver(ok); setPedido(null) }} />}
      {datos && <VentanaDatos {...datos} alCerrar={() => { datos.resolver(); setDatos(null) }} />}
      <div className="avisos-breves" role="status" aria-live="polite">
        {avisos.map((a) => (
          <p key={a.id} className={`aviso-breve ${a.tipo}${a.saliendo ? ' saliendo' : ''}`}>
            <span className="aviso-breve-icono" aria-hidden="true" />{a.texto}
          </p>
        ))}
      </div>
    </Ctx.Provider>
  )
}

function VentanaConfirmar({ titulo, mensaje, confirmar = 'Confirmar', cancelar = 'Cancelar', peligro, alResponder }: OpcionesConfirmar & { alResponder: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const respuesta = useRef(false)
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal() }, [])
  const responder = (ok: boolean) => { respuesta.current = ok; ref.current?.close() }
  return (
    <dialog
      ref={ref}
      className="confirmacion-eliminacion"
      aria-labelledby="confirmar-titulo"
      aria-describedby={mensaje ? 'confirmar-mensaje' : undefined}
      onClose={() => alResponder(respuesta.current)}
      {...cerrarConFondo(() => responder(false))}
    >
      <div className="confirmacion-eliminacion-tarjeta">
        <h2 id="confirmar-titulo">{titulo}</h2>
        {mensaje && <p id="confirmar-mensaje">{mensaje}</p>}
        <div className="confirmacion-eliminacion-acciones">
          <button type="button" className="btn sec chico" onClick={() => responder(false)}>{cancelar}</button>
          <button type="button" className={`btn chico${peligro ? ' confirmar-borrado' : ''}`} autoFocus onClick={() => responder(true)}>{confirmar}</button>
        </div>
      </div>
    </dialog>
  )
}

function VentanaDatos({ titulo, mensaje, datos, advertencia, alCerrar }: OpcionesDatos & { alCerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [copiado, setCopiado] = useState<'no' | 'si' | 'error'>('no')
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal() }, [])
  const copiar = async () => {
    try { await navigator.clipboard.writeText(datos); setCopiado('si') } catch { setCopiado('error') }
  }
  return (
    <dialog ref={ref} className="confirmacion-eliminacion" aria-labelledby="datos-titulo" onClose={alCerrar}>
      <div className="confirmacion-eliminacion-tarjeta ventana-datos">
        <h2 id="datos-titulo">{titulo}</h2>
        {mensaje && <p>{mensaje}</p>}
        <pre className="datos-acceso">{datos}</pre>
        {advertencia && <p className="datos-advertencia">{advertencia}</p>}
        {copiado === 'error' && <p className="error" role="alert">No se pudo copiar. Seleccioná el texto a mano.</p>}
        <div className="confirmacion-eliminacion-acciones">
          <button type="button" className="btn sec chico" onClick={() => void copiar()}>{copiado === 'si' ? 'Copiado ✓' : 'Copiar datos'}</button>
          <button type="button" className="btn chico" onClick={() => ref.current?.close()}>Listo</button>
        </div>
      </div>
    </dialog>
  )
}
