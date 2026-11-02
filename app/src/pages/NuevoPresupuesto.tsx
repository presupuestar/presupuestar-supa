import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useSesion } from '../context/Sesion'
import { repositorio } from '../lib/repositorio'
import { formatearImporte, importeEnMoneda, normalizarMoneda, parseCantidad, parseImporte } from '../lib/formato'
import { generarPdf, nombreArchivo } from '../lib/pdf/generar'
import { FORMAS_PAGO, OTRA_FORMA } from '../lib/pagos'
import { requiereSena } from '../lib/pagos'
import { mensajeError } from '../lib/errores'
import { sePuedeEditar } from '../lib/estados'
import { convertirUsdAArs, obtenerCotizacionBlue } from '../lib/cotizacion'
import type { Cliente, Item, Presupuesto } from '../lib/tipos'

/** Una línea mientras se edita: los números son texto para poder tipear con coma. */
interface LineaEdit { key: string; itemId: string | null; descripcion: string; detalle: string; cantidad: string; precio: string; moneda: string; proveedor?: string; enCatalogo?: boolean; precioOrigen?: number; monedaOrigen?: string }

const lineaValida = (l: LineaEdit) =>
  l.descripcion.trim() !== '' && parseCantidad(l.cantidad) > 0 && Number.isFinite(parseImporte(l.precio)) && parseImporte(l.precio) >= 0
const importe = (l: LineaEdit) =>
  lineaValida(l) ? Math.round(parseCantidad(l.cantidad) * parseImporte(l.precio) * 100) / 100 : 0
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const hoy = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 12:00:00.000Z`
}
const leer = (clave: string) => { try { return localStorage.getItem(clave) ?? '' } catch { return '' } }
const guardarLocal = (clave: string, valor: string) => { try { localStorage.setItem(clave, valor) } catch { /* sin almacenamiento */ } }
const nuevaKey = () => globalThis.crypto?.randomUUID?.() ?? `linea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Sirve para crear (/nuevo) y editar borradores, pendientes o aceptados. */
export function NuevoPresupuesto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [vuelta, setVuelta] = useState(0)
  const [inicial, setInicial] = useState<Presupuesto | null | undefined>(id ? undefined : null) // undefined = cargando
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    if (!id) { setInicial(null); return }
    setInicial(undefined); setErrorCarga('')
    repositorio.presupuestos.obtener(id).then(setInicial).catch((e) => setErrorCarga(mensajeError(e, 'No se pudo cargar el presupuesto.')))
  }, [id])

  if (errorCarga) return <Layout><main className="contenido"><p className="error" role="alert">{errorCarga}</p><Link className="btn sec chico" to="/historial">Volver al historial</Link></main></Layout>
  if (inicial === undefined) return <Layout><main className="contenido"><p className="sub">Cargando…</p></main></Layout>
  if (inicial && !sePuedeEditar(inicial.estado)) {
    return (
      <Layout><main className="contenido">
        <h1>Este presupuesto ya no se puede editar</h1>
        <p className="sub">Un presupuesto rechazado queda como registro. Si necesitás corregirlo, volvelo a pendiente desde el historial.</p>
        <Link className="btn sec chico" to="/historial">Volver al historial</Link>
      </main></Layout>
    )
  }
  return <Layout><Formulario key={`${id ?? 'nuevo'}-${vuelta}`} inicial={inicial} alNuevo={() => (id ? navigate('/nuevo') : setVuelta(vuelta + 1))} /></Layout>
}

function Formulario({ inicial, alNuevo }: { inicial: Presupuesto | null; alNuevo: () => void }) {
  const { empresa } = useSesion()
  const [catalogo, setCatalogo] = useState<Item[]>([])
  const [busquedaItem, setBusquedaItem] = useState('')
  const [itemUsdPendiente, setItemUsdPendiente] = useState<Item | null>(null)
  const busquedaItemDiferida = useDeferredValue(busquedaItem)
  const [clientes, setClientes] = useState<Cliente[]>([])

  // Los datos identificatorios adicionales son opcionales.
  const [clienteSel, setClienteSel] = useState(inicial?.cliente ?? '')
  const [nombre, setNombre] = useState(inicial?.clienteDatos?.nombre ?? '')
  const [email, setEmail] = useState(inicial?.clienteDatos?.email ?? '')
  const [telefono, setTelefono] = useState(inicial?.clienteDatos?.telefono ?? '')
  const [documento, setDocumento] = useState(inicial?.clienteDatos?.documento ?? '')
  const [direccion, setDireccion] = useState(inicial?.clienteDatos?.direccion ?? '')
  const [guardarCliente, setGuardarCliente] = useState(true)

  const [lineas, setLineas] = useState<LineaEdit[]>(() => (inicial?.lineas ?? []).map((l) => ({
    key: nuevaKey(), itemId: l.itemId, descripcion: l.descripcion, detalle: l.detalle ?? '', cantidad: String(l.cantidad).replace('.', ','), precio: formatearImporte(l.precioUnitario), moneda: normalizarMoneda(l.moneda ?? inicial?.moneda), precioOrigen: l.precioOrigen, monedaOrigen: l.monedaOrigen,
  })))
  const [cotizacionDolar, setCotizacionDolar] = useState<number | undefined>(inicial?.cotizacionDolar)
  const [cotizacionFecha, setCotizacionFecha] = useState(inicial?.cotizacionFecha ?? '')
  const [consultandoCotizacion, setConsultandoCotizacion] = useState(false)
  const [ajusteGeneral, setAjusteGeneral] = useState('')
  const [ganancia, setGanancia] = useState(formatearImporte(inicial?.ganancia ?? 0))
  const [plazo, setPlazo] = useState(inicial?.plazo ?? '')
  const [validez, setValidez] = useState(String(inicial?.validezDias ?? empresa?.validezDias ?? 15))
  // La forma de pago se elige en cada presupuesto; recuerda la última usada.
  const guardada = leer('presupuestar.pago')
  const formaGuardada = inicial?.formaPago ?? ''
  const [pagoOpcion, setPagoOpcion] = useState(
    formaGuardada ? (FORMAS_PAGO.includes(formaGuardada) ? formaGuardada : OTRA_FORMA)
      : (FORMAS_PAGO.includes(guardada) || guardada === OTRA_FORMA ? guardada : FORMAS_PAGO[0]))
  const [pagoOtra, setPagoOtra] = useState(formaGuardada && !FORMAS_PAGO.includes(formaGuardada) ? formaGuardada : leer('presupuestar.pagoOtra'))
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [foco, setFoco] = useState<string | null>(null)

  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState<Presupuesto | null>(null)
  const proveedorPorItem = useMemo(() => new Map(catalogo.map((item) => [item.id, item.proveedor])), [catalogo])

  useEffect(() => {
    repositorio.items.listar().then(setCatalogo).catch((e) => setError(mensajeError(e, 'No se pudo cargar el catálogo.')))
    repositorio.clientes.listar().then(setClientes).catch(() => {})
  }, [])
  useEffect(() => {
    if (catalogo.length === 0) return
    setLineas((ls) => {
      let cambio = false
      const nuevas = ls.map((linea) => {
        const proveedor = linea.itemId ? proveedorPorItem.get(linea.itemId) : undefined
        if (!proveedor || proveedor === linea.proveedor) return linea
        cambio = true
        return { ...linea, proveedor }
      })
      return cambio ? nuevas : ls
    })
  }, [catalogo, proveedorPorItem])
  useEffect(() => { if (!inicial && empresa?.validezDias) setValidez(String(empresa.validezDias)) }, [empresa?.validezDias, inicial])

  // El aviso de validación se va apenas el usuario corrige algo.
  useEffect(() => { setError('') }, [nombre, email, telefono, documento, direccion, lineas, ganancia])

  const total = useMemo(() => Math.round(lineas.reduce((s, l) => s + importe(l), 0) * 100) / 100, [lineas])
  const monedaPresupuesto = normalizarMoneda(lineas[0]?.moneda ?? inicial?.moneda)
  const proveedoresCatalogo = useMemo(
    () => [...new Set(catalogo.map((i) => i.proveedor?.trim()).filter((p): p is string => Boolean(p)))].sort((a, b) => a.localeCompare(b)),
    [catalogo],
  )
  const itemsCatalogoFiltrados = useMemo(() => {
    const consulta = busquedaItemDiferida.trim().toLocaleLowerCase()
    if (!consulta) return []
    return catalogo.filter((item) => item.nombre.toLocaleLowerCase().includes(consulta))
  }, [catalogo, busquedaItemDiferida])
  const resultadosCatalogo = useMemo(() => itemsCatalogoFiltrados.slice(0, 30), [itemsCatalogoFiltrados])

  const elegirCliente = (id: string) => {
    setClienteSel(id)
    const c = clientes.find((x) => x.id === id)
    setNombre(c?.nombre ?? ''); setEmail(c?.email ?? ''); setTelefono(c?.telefono ?? '')
    setDocumento(c?.documento ?? ''); setDireccion(c?.direccion ?? '')
  }

  const cambiarLinea = (key: string, cambios: Partial<LineaEdit>) =>
    setLineas((ls) => ls.map((l) => {
      if (l.key !== key) return l
      const actualizada = { ...l, ...cambios }
      if (cambios.precio !== undefined && l.monedaOrigen === 'USD' && cotizacionDolar) {
        const precio = parseImporte(cambios.precio)
        if (Number.isFinite(precio) && precio >= 0) actualizada.precioOrigen = Math.round(precio / cotizacionDolar * 100) / 100
      }
      return actualizada
    }))
  const quitarLinea = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key))

  const agregarDelCatalogo = async (id: string, convertirUsd = false) => {
    const it = catalogo.find((x) => x.id === id)
    if (!it) return
    const monedaItem = normalizarMoneda(it.moneda)
    const convertir = monedaItem === 'USD' && convertirUsd
    const monedaFinal = convertir ? 'ARS' : monedaItem
    if (lineas.length > 0 && monedaFinal !== monedaPresupuesto) {
      return setError(`No se puede agregar un ítem en ${monedaFinal} a un presupuesto en ${monedaPresupuesto}. No se mezclan monedas en el mismo total.`)
    }
    setError('')
    setConsultandoCotizacion(convertir)
    try {
      let tasa = cotizacionDolar
      let fecha = cotizacionFecha
      if (convertir && (!tasa || tasa < 100 || tasa > 100_000 || !fecha)) {
        const actual = await obtenerCotizacionBlue()
        tasa = actual.venta
        fecha = actual.fecha
        setCotizacionDolar(tasa)
        setCotizacionFecha(fecha)
      }
      const precio = convertir ? convertirUsdAArs(it.precio, tasa ?? 0) : it.precio
      setLineas((ls) => [...ls, {
        key: nuevaKey(), itemId: it.id, descripcion: it.nombre, detalle: it.descripcion ?? '', cantidad: '1',
        precio: formatearImporte(precio), moneda: monedaFinal, proveedor: it.proveedor,
        ...(convertir ? { precioOrigen: it.precio, monedaOrigen: 'USD' } : {}),
      }])
      setBusquedaItem('')
      setItemUsdPendiente(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : mensajeError(e, 'No se pudo obtener la cotización del dólar blue. No se agregó el ítem.'))
    } finally {
      setConsultandoCotizacion(false)
    }
  }
  const incrementarTodo = () => {
    const pct = parseCantidad(ajusteGeneral)
    if (!Number.isFinite(pct) || pct <= 0) return setError('El incremento debe ser un porcentaje mayor a 0.')
    if (lineas.length === 0 || lineas.some((linea) => !lineaValida(linea))) {
      return setError('Completá los ítems y sus importes antes de aplicar el incremento.')
    }
    if (new Set(lineas.map((linea) => normalizarMoneda(linea.moneda))).size > 1) {
      return setError('No se puede aplicar un incremento si los ítems tienen monedas distintas.')
    }
    const importeIncremento = Math.round((total * pct / 100) * 100) / 100
    setLineas((ls) => [...ls, {
      key: nuevaKey(),
      itemId: null,
      descripcion: `Incremento por inflación (${pct}%)`,
      detalle: '',
      cantidad: '1',
      precio: formatearImporte(importeIncremento),
      moneda: monedaPresupuesto,
    }])
    setAjusteGeneral('')
    setError('')
  }
  const agregarPersonalizado = () => {
    const key = nuevaKey()
    setLineas((ls) => [...ls, { key, itemId: null, descripcion: '', detalle: '', cantidad: '1', precio: '', moneda: monedaPresupuesto }])
    setFoco(key)
  }
  const guardarEnCatalogo = async (l: LineaEdit) => {
    try {
      const it = await repositorio.items.crear({ nombre: l.descripcion.trim(), descripcion: l.detalle.trim(), proveedor: l.proveedor?.trim() ?? '', unidad: 'unidad', precio: parseImporte(l.precio), moneda: l.moneda, activo: true })
      setCatalogo((c) => [...c, it].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      cambiarLinea(l.key, { itemId: it.id, enCatalogo: true })
    } catch (e) { setError(mensajeError(e, 'No se pudo guardar el ítem en el catálogo.')) }
  }

  const problemas = (estado: 'borrador' | 'pendiente' | 'aceptado'): string => {
    if (!nombre.trim()) return 'Falta el nombre del cliente.'
    if (lineas.length === 0) return 'Agregá al menos un ítem al presupuesto.'
    if (lineas.some((l) => !lineaValida(l))) return 'Revisá los ítems: cada uno necesita descripción, una cantidad mayor a 0 y un importe de 0 o más.'
    if (new Set(lineas.map((l) => normalizarMoneda(l.moneda))).size > 1) return 'Un presupuesto no puede mezclar precios de distintas monedas.'
    if (!Number.isFinite(parseImporte(ganancia)) || parseImporte(ganancia) < 0) return 'La ganancia tiene que ser un importe igual o mayor a 0.'
    if (estado !== 'borrador') {
      if (pagoOpcion === OTRA_FORMA && !pagoOtra.trim()) return 'Escribí la forma de pago o elegí una de la lista.'
    }
    return ''
  }

  const guardar = async (estado: 'borrador' | 'pendiente' | 'aceptado') => {
    const p = problemas(estado)
    if (p) return setError(p)
    setError(''); setGuardando(true)
    try {
      const datos = { nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim(), documento: documento.trim(), direccion: direccion.trim() }
      let clienteId = clienteSel
      // Los clientes guardados exigen los tres datos: solo se actualizan o crean si están completos.
      if (datos.nombre && EMAIL.test(datos.email) && datos.telefono) {
        if (clienteSel) await repositorio.clientes.actualizar(clienteSel, datos)
        else if (guardarCliente) clienteId = (await repositorio.clientes.crear(datos)).id
      }
      const campos = {
        estado,
        validezDias: Number(validez) > 0 ? Math.round(Number(validez)) : 15,
        plazo: plazo.trim(),
        formaPago: pagoOpcion === OTRA_FORMA ? pagoOtra.trim() : pagoOpcion,
        notas: notas.trim(),
        ganancia: parseImporte(ganancia),
        moneda: monedaPresupuesto,
        cotizacionDolar: cotizacionDolar ?? 0,
        cotizacionFecha,
        clienteDatos: datos,
        lineas: lineas.map((l) => ({ itemId: l.itemId, descripcion: l.descripcion.trim(), detalle: l.detalle.trim(), cantidad: parseCantidad(l.cantidad), precioUnitario: parseImporte(l.precio), moneda: normalizarMoneda(l.moneda), ...(l.precioOrigen !== undefined && l.monedaOrigen ? { precioOrigen: l.precioOrigen, monedaOrigen: l.monedaOrigen } : {}) })),
      }
      // El número y el total los asigna/recalcula el servidor.
      const guardado = inicial
        ? await repositorio.presupuestos.actualizar(inicial.id, { ...campos, cliente: clienteId || '' })
        : await repositorio.presupuestos.crear({ ...campos, fechaEmision: hoy(), cliente: clienteId || undefined })
      guardarLocal('presupuestar.pago', pagoOpcion); guardarLocal('presupuestar.pagoOtra', pagoOtra)
      setListo(guardado)
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar el presupuesto.'))
    } finally { setGuardando(false) }
  }

  if (listo) return <Listo presupuesto={listo} alNuevo={alNuevo} />

  return (
    <main className="contenido ancho presupuesto-edicion">
      <h1>{inicial ? `Editar presupuesto N° ${String(inicial.numero).padStart(4, '0')}` : 'Nuevo presupuesto'}</h1>
      <p className="sub">Completá los datos del cliente y sumá los ítems: del catálogo o personalizados, con el importe que necesites.</p>

      <datalist id="mayoristas-catalogo">{proveedoresCatalogo.map((p) => <option key={p} value={p} />)}</datalist>

      <section className="panel">
        <h2>Cliente</h2>
        {clientes.length > 0 && (
          <label className="campo">Cliente guardado
            <select value={clienteSel} onChange={(e) => elegirCliente(e.target.value)}>
              <option value="">Cliente nuevo</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}
        <div className="tres">
          <label className="campo">Nombre completo <small>(obligatorio)</small>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" maxLength={160} />
          </label>
          <label className="campo">Correo electrónico <small>(opcional)</small>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label className="campo">Teléfono <small>(opcional)</small>
            <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" maxLength={40} />
          </label>
          <label className="campo">DNI / CUIT / CUIL <small>(opcional)</small>
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} autoComplete="off" maxLength={40} />
          </label>
          <label className="campo">Dirección <small>(opcional)</small>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} autoComplete="street-address" maxLength={300} />
          </label>
        </div>
        {!clienteSel
          ? <label className="check"><input type="checkbox" checked={guardarCliente} onChange={(e) => setGuardarCliente(e.target.checked)} /> Guardar en mis clientes para la próxima</label>
          : <p className="ayuda">Si cambiás estos datos, se actualizan también en el cliente guardado.</p>}
      </section>

      <section className="panel">
        <h2>Ítems</h2>
        {cotizacionDolar && <p className="aviso-cotizacion" role="status">Cotización dólar blue venta: <strong>{importeEnMoneda(cotizacionDolar, 'ARS')}</strong> por USD · actualizada {new Date(cotizacionFecha).toLocaleString('es-AR')}. Se conserva esta tasa en el presupuesto.</p>}
        {lineas.length === 0
          ? <p className="vacio-linea">Todavía no hay ítems. Agregá uno del catálogo o creá uno personalizado.</p>
          : (
            <div className="lineas">
              <div className="linea cab" aria-hidden="true"><span>Descripción</span><span>Cant.</span><span>Importe unitario</span><span>Subtotal</span><span /></div>
              {lineas.map((l) => (
                <div className="linea" key={l.key}>
                  <div className="desc">
                    <input aria-label="Descripción" placeholder="Descripción del ítem" value={l.descripcion} maxLength={200}
                      autoFocus={foco === l.key} onChange={(e) => cambiarLinea(l.key, { descripcion: e.target.value })} />
                    <textarea aria-label="Detalle opcional" placeholder="Detalle adicional (opcional)" rows={2} maxLength={500} value={l.detalle}
                      onChange={(e) => cambiarLinea(l.key, { detalle: e.target.value })} />
                    {l.proveedor && l.itemId !== null && <small className="proveedor-interno">Proveedor (uso interno): {l.proveedor}</small>}
                    {l.itemId === null && (
                      <>
                        <label className="campo proveedor-personalizado">Mayorista <small>(opcional · uso interno)</small>
                          <input list="mayoristas-catalogo" maxLength={160} value={l.proveedor ?? ''} onChange={(e) => cambiarLinea(l.key, { proveedor: e.target.value })} placeholder="Asignar proveedor" />
                        </label>
                        <small>
                          <span className="pill pers">Personalizado</span>
                          <button className="link" disabled={!lineaValida(l)} onClick={() => guardarEnCatalogo(l)}>Guardar en el catálogo</button>
                        </small>
                      </>
                    )}
                    {l.enCatalogo && <small className="ok">Guardado en el catálogo</small>}
                  </div>
                  <label className="campo-linea campo-cantidad"><span>Cantidad</span>
                    <input aria-label="Cantidad" inputMode="decimal" value={l.cantidad} onChange={(e) => cambiarLinea(l.key, { cantidad: e.target.value })} />
                  </label>
                  <label className="campo-linea campo-precio"><span>Importe unitario ({normalizarMoneda(l.moneda)})</span>
                    <input aria-label="Importe unitario" inputMode="decimal" placeholder="Ej.: 150.000" value={l.precio}
                      onChange={(e) => cambiarLinea(l.key, { precio: e.target.value })}
                      onBlur={() => { const n = parseImporte(l.precio); if (Number.isFinite(n)) cambiarLinea(l.key, { precio: formatearImporte(n) }) }} />
                    {l.monedaOrigen && l.precioOrigen !== undefined && <small className="precio-origen">Origen: {importeEnMoneda(l.precioOrigen, l.monedaOrigen)}</small>}
                  </label>
                  <span className="sub-total">{importeEnMoneda(importe(l), l.moneda)}</span>
                  <button className="quitar" aria-label="Quitar ítem" onClick={() => quitarLinea(l.key)}>×</button>
                </div>
              ))}
            </div>
          )}
        <div className="agregar">
          <div className="campo chico-campo buscar-agregar-item">
            <label htmlFor="buscar-agregar-item">Agregar ítem del catálogo</label>
            <input
              id="buscar-agregar-item"
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(busquedaItem.trim() && resultadosCatalogo.length)}
              aria-controls="resultados-agregar-item"
              aria-label="Buscar ítem del catálogo por nombre"
              placeholder={catalogo.length ? 'Escribí el nombre del ítem…' : 'El catálogo está vacío'}
              value={busquedaItem}
              disabled={consultandoCotizacion || catalogo.length === 0}
              onChange={(e) => setBusquedaItem(e.target.value)}
            />
            {busquedaItem.trim() && <div className="resultados-agregar-item" id="resultados-agregar-item" role="listbox" aria-label="Ítems coincidentes">
              {resultadosCatalogo.map((item) => (
                <button key={item.id} type="button" role="option" aria-selected="false" disabled={consultandoCotizacion} onClick={() => {
                  if (normalizarMoneda(item.moneda) === 'USD') setItemUsdPendiente(item)
                  else void agregarDelCatalogo(item.id)
                }}>
                  <span>{item.nombre}</span>
                  <small>{item.proveedor?.trim() || 'Sin mayorista'} · {importeEnMoneda(item.precio, item.moneda)}</small>
                </button>
              ))}
              {itemsCatalogoFiltrados.length === 0 && <p>No se encontraron ítems con ese nombre.</p>}
              {itemsCatalogoFiltrados.length > resultadosCatalogo.length && <p>Mostrando {resultadosCatalogo.length} de {itemsCatalogoFiltrados.length}; escribí más letras para afinar la búsqueda.</p>}
            </div>}
            {itemUsdPendiente && <div className="eleccion-moneda-item" role="group" aria-label={`Elegir moneda para ${itemUsdPendiente.nombre}`}>
              <div>
                <strong>{itemUsdPendiente.nombre}</strong>
                <span>Precio de catálogo: {importeEnMoneda(itemUsdPendiente.precio, 'USD')}. ¿Cómo querés agregarlo?</span>
                {lineas.length > 0 && monedaPresupuesto !== 'USD' && monedaPresupuesto !== 'ARS' &&
                  <small>El presupuesto actual está en {monedaPresupuesto}; no se pueden mezclar monedas.</small>}
              </div>
              <div className="botones">
                <button type="button" className="btn sec chico" disabled={consultandoCotizacion || (lineas.length > 0 && monedaPresupuesto !== 'USD')} onClick={() => { void agregarDelCatalogo(itemUsdPendiente.id) }}>
                  Mantener en USD
                </button>
                <button type="button" className="btn chico" disabled={consultandoCotizacion || (lineas.length > 0 && monedaPresupuesto !== 'ARS')} onClick={() => { void agregarDelCatalogo(itemUsdPendiente.id, true) }}>
                  {consultandoCotizacion ? 'Consultando cotización…' : 'Convertir a ARS'}
                </button>
                <button type="button" className="btn sec chico" disabled={consultandoCotizacion} onClick={() => setItemUsdPendiente(null)}>Cancelar</button>
              </div>
              <small>La conversión usa el dólar blue de venta y solo afecta este presupuesto; el catálogo conserva el precio original en USD.</small>
            </div>}
          </div>
          <button className="btn sec chico" onClick={agregarPersonalizado}>+ Agregar ítem personalizado</button>
          <label className="campo ajuste-general">Incremento por inflación (%)
            <input inputMode="decimal" value={ajusteGeneral} onChange={(e) => setAjusteGeneral(e.target.value)} placeholder="Ej.: 10" />
          </label>
          <button type="button" className="btn sec chico" onClick={incrementarTodo}>Agregar incremento como ítem</button>
        </div>
      </section>

      <section className="panel">
        <h2>Condiciones</h2>
        <div className="dos">
          <label className="campo">Forma de pago
            <select value={pagoOpcion} onChange={(e) => setPagoOpcion(e.target.value)}>
              {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value={OTRA_FORMA}>Otra…</option>
            </select>
          </label>
          {pagoOpcion === OTRA_FORMA && (
            <label className="campo">Detalle de la forma de pago
              <input value={pagoOtra} onChange={(e) => setPagoOtra(e.target.value)} placeholder="Ej.: 30% al aceptar y el saldo en 3 cuotas" maxLength={300} autoFocus />
            </label>
          )}
        </div>
        <div className="dos">
          <label className="campo">Plazo <small>(opcional)</small>
            <input value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="Ej.: 30 días corridos" maxLength={80} />
          </label>
          <label className="campo">Validez del presupuesto (días)
            <input inputMode="numeric" value={validez} onChange={(e) => setValidez(e.target.value)} />
          </label>
        </div>
        <label className="campo">Notas <small>(opcional)</small>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={2000} />
        </label>
        <label className="campo">Ganancia estimada ({monedaPresupuesto}) <small>(solo visible en el panel interno; no se incluye en el PDF)</small>
          <input inputMode="decimal" value={ganancia} onChange={(e) => setGanancia(e.target.value)}
            onBlur={() => { const n = parseImporte(ganancia); if (Number.isFinite(n) && n >= 0) setGanancia(formatearImporte(n)) }} />
        </label>
      </section>

      <div className="barra-total">
        <div className="total-num">
          <span>Total ({monedaPresupuesto})</span>
          <strong>{importeEnMoneda(total, monedaPresupuesto)}</strong>
          {requiereSena(pagoOpcion === OTRA_FORMA ? pagoOtra : pagoOpcion) && <small>Seña del 50%: {importeEnMoneda(Math.round(total * 50) / 100, monedaPresupuesto)}</small>}
        </div>
        <div className={`botones${inicial?.estado === 'pendiente' || inicial?.estado === 'aceptado' ? ' una-accion' : ''}`}>
          {error && <p className="error" role="alert">{error}</p>}
          {inicial?.estado === 'pendiente' || inicial?.estado === 'aceptado'
            ? <button className="btn chico" disabled={guardando} onClick={() => guardar(inicial?.estado === 'aceptado' ? 'aceptado' : 'pendiente')}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            : <>
                <button className="btn sec chico" disabled={guardando} onClick={() => guardar('borrador')}>Guardar borrador</button>
                <button className="btn chico" disabled={guardando} onClick={() => guardar('pendiente')}>{guardando ? 'Guardando…' : 'Emitir presupuesto'}</button>
              </>}
        </div>
      </div>
    </main>
  )
}

/** Pantalla posterior a guardar: genera el PDF A4 con la plantilla de la empresa y permite descargarlo. */
function Listo({ presupuesto, alNuevo }: { presupuesto: Presupuesto; alNuevo: () => void }) {
  const { empresa } = useSesion()
  const [url, setUrl] = useState<string | null>(null)
  const [estado, setEstado] = useState<'generando' | 'ok' | 'error'>('generando')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!empresa) return
    let vigente = true
    let local = ''
    setEstado('generando')
    generarPdf(presupuesto, empresa)
      .then((blob) => { if (!vigente) return; local = URL.createObjectURL(blob); setUrl(local); setEstado('ok') })
      .catch(() => { if (vigente) setEstado('error') })
    return () => { vigente = false; if (local) URL.revokeObjectURL(local) }
  }, [presupuesto, empresa, intento])

  return (
    <main className="contenido ancho">
      <section className="listo" role="status">
        <h1>Presupuesto N° {String(presupuesto.numero).padStart(4, '0')} guardado</h1>
        <p className="sub">
          Quedó como <strong>{presupuesto.estado === 'borrador' ? 'borrador' : presupuesto.estado === 'aceptado' ? 'aceptado' : 'pendiente'}</strong>
          {presupuesto.clienteDatos.nombre ? <> para {presupuesto.clienteDatos.nombre}</> : null} por <strong>{importeEnMoneda(presupuesto.total, presupuesto.moneda)}</strong>.
        </p>
        <div className="botones izq">
          {estado === 'ok' && url && <a className="btn chico" href={url} download={nombreArchivo(presupuesto)}>Descargar PDF</a>}
          {estado === 'generando' && <button className="btn chico" disabled>Generando PDF…</button>}
          {estado === 'error' && <button className="btn chico" onClick={() => setIntento(intento + 1)}>Reintentar PDF</button>}
          <button className="btn sec chico" onClick={alNuevo}>Crear otro presupuesto</button>
          <Link className="btn sec chico" to="/historial">Ver historial</Link>
          <Link className="btn sec chico" to="/">Ir al inicio</Link>
        </div>
        {estado === 'error' && <p className="error" role="alert">No se pudo generar el PDF. El presupuesto está guardado: probá de nuevo.</p>}
      </section>
      {estado === 'ok' && url && (
        <div className="vista-pdf"><iframe src={url} title={`Vista previa del presupuesto N° ${presupuesto.numero}`} /></div>
      )}
    </main>
  )
}
