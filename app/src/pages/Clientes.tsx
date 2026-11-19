import { CargandoFilas, EstadoVacio } from '../components/EstadoVacio'
import { useAvisos } from '../components/Avisos'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { cerrarConFondo } from '../lib/dialogo'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { tienePermiso, useSesion } from '../context/Sesion'
import { mensajeError } from '../lib/errores'
import { fechaCorta, importeEnMoneda } from '../lib/formato'
import { filtrarPorAlcance, repositorio } from '../lib/repositorio'
import { supabase } from '../lib/supabase'
import type { Cliente, Estado, Presupuesto } from '../lib/tipos'
import { ETIQUETA, fechaVigencia, presupuestoCaducado } from '../lib/estados'

const pageSize = 25
const blankClient: Omit<Cliente, 'id' | 'empresa'> = {
  nombre: '', email: '', telefono: '', documento: '', direccion: '',
}

export function Clientes() {
  const { usuario } = useSesion()
  const { confirmar, avisar } = useAvisos()
  const puedeVerPresupuestos = tienePermiso(usuario, 'quotes.view_own') || tienePermiso(usuario, 'quotes.view_all')
  const [clients, setClients] = useState<Cliente[] | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Cliente | 'new' | null>(null)
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [quotes, setQuotes] = useState<Presupuesto[] | null>(null)
  const [quotePage, setQuotePage] = useState(0)
  const [quoteCount, setQuoteCount] = useState(0)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  const [resumenClientes, setResumenClientes] = useState<Map<string, { cantidad: number; ultima: string }>>(new Map())
  const loadClients = async () => {
    const data = await repositorio.clientes.listar()
    setClients(data)
    if (puedeVerPresupuestos) {
      // Cantidad de presupuestos y fecha del último por cliente (solo los que la persona puede ver).
      const { data: filas } = await filtrarPorAlcance(supabase.from('quotes').select('client_id,issue_date,created_at').not('client_id', 'is', null))
      const resumen = new Map<string, { cantidad: number; ultima: string }>()
      for (const f of filas ?? []) {
        const fecha = String(f.issue_date || f.created_at || '')
        const actual = resumen.get(String(f.client_id)) ?? { cantidad: 0, ultima: '' }
        resumen.set(String(f.client_id), { cantidad: actual.cantidad + 1, ultima: fecha > actual.ultima ? fecha : actual.ultima })
      }
      setResumenClientes(resumen)
    }
  }
  useEffect(() => {
    loadClients().catch((e: unknown) => setError(mensajeError(e, 'No se pudieron cargar los clientes.')))
  }, [])

  useEffect(() => {
    if (!selected) {
      setQuotes(null)
      return
    }
    if (!puedeVerPresupuestos) {
      setQuotes([])
      setQuoteCount(0)
      return
    }
    let active = true
    setQuotes(null)
    const consulta = filtrarPorAlcance(supabase.from('quotes').select('*', { count: 'exact' }).eq('client_id', selected.id))
      .order('number', { ascending: false }).range(quotePage * pageSize, (quotePage + 1) * pageSize - 1)
    void Promise.resolve(consulta)
      .then(({ data, count, error: resultError }) => {
        if (!active) return
        if (resultError) {
          setError(mensajeError(resultError, 'No se pudo cargar el historial del cliente.'))
          setQuotes([])
          setQuoteCount(0)
        }
        else {
          setQuoteCount(count ?? 0)
          setQuotes((data ?? []).map((r) => ({
            id: r.id, empresa: r.company_id, numero: r.number, estado: r.status as Estado,
            fechaEmision: r.issue_date ?? '', validezDias: r.validity_days ?? undefined,
            plazo: r.delivery_time, formaPago: r.payment_terms, notas: r.notes, ganancia: Number(r.profit),
            cliente: r.client_id ?? undefined, clienteDatos: r.client_snapshot as Presupuesto['clienteDatos'],
            lineas: r.lines as Presupuesto['lineas'], vendedor: r.seller_id ?? undefined,
            vendedorNombre: r.seller_name, vendedorEmail: r.seller_email, total: Number(r.total),
            moneda: r.currency, cotizacionDolar: Number(r.exchange_rate), cotizacionFecha: r.exchange_rate_date,
            cotizacionFuente: r.exchange_rate_source, vigenteHasta: r.valid_until_date ?? '',
            fechaRespuesta: r.answered_at ?? undefined, created: r.created_at, updated: r.updated_at,
          })))
        }
      })
      .catch((e: unknown) => {
        if (!active) return
        setError(mensajeError(e, 'No se pudo cargar el historial del cliente.'))
        setQuotes([])
        setQuoteCount(0)
      })
    return () => { active = false }
  }, [selected?.id, quotePage, puedeVerPresupuestos])

  const visibleClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return clients ?? []
    return (clients ?? []).filter((client) =>
      `${client.nombre} ${client.email} ${client.telefono} ${client.documento ?? ''}`.toLocaleLowerCase().includes(term))
  }, [clients, search])

  const exportar = async () => {
    setExportando(true)
    setError('')
    try {
      const data = await repositorio.clientes.exportarPortabilidad()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `presupuestar-datos-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch (e) {
      setError(mensajeError(e, 'No se pudo exportar la cartera.'))
    } finally {
      setExportando(false)
    }
  }

  const remove = async (client: Cliente) => {
    const ok = await confirmar({ titulo: `¿Eliminar a ${client.nombre}?`, mensaje: 'Deja de verse en la cartera y no se puede usar en presupuestos nuevos. Los presupuestos ya emitidos conservan su copia y el vínculo histórico.', confirmar: 'Eliminar cliente', peligro: true })
    if (!ok) return
    setError('')
    try {
      await repositorio.clientes.eliminar(client.id)
      if (selected?.id === client.id) setSelected(null)
      avisar('Cliente eliminado. Sus presupuestos siguen en el historial.')
      await loadClients()
    } catch (e) { setError(mensajeError(e, 'No se pudo eliminar el cliente.')) }
  }

  if (selected) {
    return <Layout><main className="contenido ancho">
      <p className="migas"><button className="link" onClick={() => setSelected(null)}>← Todos los clientes</button></p>
      <div className="encabezado">
        <div><h1>{selected.nombre}</h1><p className="sub">{[selected.email, selected.telefono].filter(Boolean).join(' · ')}</p></div>
        <div className="encabezado-acciones">
          <button className="btn sec chico" onClick={() => setEditing(selected)}>Editar cliente</button>
          {tienePermiso(usuario, 'quotes.create') && <Link className="btn chico" to="/nuevo">Nuevo presupuesto</Link>}
        </div>
      </div>
      {selected.documento && <p>Documento: {selected.documento}</p>}
      {selected.direccion && <p>Dirección: {selected.direccion}</p>}
      <h2 className="clientes-historial-titulo">Historial de presupuestos</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!puedeVerPresupuestos && <p className="vacio-linea">Tu rol no tiene permiso para consultar presupuestos.</p>}
      {puedeVerPresupuestos && <>
      <div className="tabla-caja"><table className="tabla">
        <thead><tr><th>N°</th><th>Fecha</th><th>Vendedor</th><th>Total</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {quotes === null && <CargandoFilas columnas={6} filas={3} />}
          {quotes?.length === 0 && <tr><td className="vacio" colSpan={6}>Este cliente todavía no tiene presupuestos vinculados.</td></tr>}
          {quotes?.map((quote) => <tr key={quote.id}>
            <td><strong>{String(quote.numero).padStart(4, '0')}</strong></td>
            <td>{fechaCorta(quote.fechaEmision || quote.created)}</td>
            <td>{quote.vendedorNombre || '—'}</td>
            <td>{importeEnMoneda(quote.total, quote.moneda)}</td>
            <td>{presupuestoCaducado(quote) ? <span className="pill caducado">Caducado · venció el {fechaCorta(fechaVigencia(quote.fechaEmision, quote.validezDias, quote.vigenteHasta))}</span> : ETIQUETA[quote.estado]}</td>
            <td>{(usuario?.rol === 'admin' || (tienePermiso(usuario, 'quotes.update_own') && quote.vendedor === usuario?.id))
              && (quote.estado === 'borrador' || quote.estado === 'pendiente' || quote.estado === 'aceptado')
              ? <Link className="link" to={`/presupuestos/${quote.id}/editar`}>Editar</Link>
              : null}</td>
          </tr>)}
        </tbody>
      </table></div>
      {quoteCount > pageSize && <div className="botones clientes-paginacion">
        <button className="btn sec chico" disabled={quotePage === 0} onClick={() => setQuotePage((p) => p - 1)}>Anterior</button>
        <span className="ayuda">Página {quotePage + 1} de {Math.ceil(quoteCount / pageSize)}</span>
        <button className="btn sec chico" disabled={(quotePage + 1) * pageSize >= quoteCount} onClick={() => setQuotePage((p) => p + 1)}>Siguiente</button>
      </div>}
      </>}
      {editing && <ClientForm client={editing === 'new' ? null : editing} close={() => setEditing(null)} saved={async () => {
        setEditing(null)
        avisar('Listo, cliente guardado.')
        const fresh = await repositorio.clientes.listar()
        setClients(fresh)
        setSelected(fresh.find((c) => c.id === selected.id) ?? selected)
      }} />}
    </main></Layout>
  }

  return <Layout><main className="contenido ancho">
    <div className="encabezado">
      <div><h1>Clientes</h1><p className="sub">Guardá los datos de contacto y consultá el historial de presupuestos por cliente.</p></div>
      <div className="encabezado-acciones">
        <button className="btn sec chico" disabled={exportando || clients === null} onClick={() => void exportar()}>{exportando ? 'Exportando…' : 'Exportar datos'}</button>
        <button className="btn chico" onClick={() => setEditing('new')}>Nuevo cliente</button>
      </div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="filtros"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, correo o teléfono…" aria-label="Buscar clientes" /></div>
    {clients !== null && clients.length === 0 ? (
      <EstadoVacio icono="personas" titulo="Todavía no hay clientes guardados"
        acciones={<button className="btn chico" onClick={() => setEditing('new')}>Agregar cliente</button>}>
        Los clientes se guardan solos al emitir un presupuesto, o podés cargarlos acá. Después los elegís en un clic y ves su historial.
      </EstadoVacio>
    ) : (
    <div className="tabla-caja tabla-clientes-caja"><table className="tabla tabla-clientes">
      <thead><tr><th>Cliente</th><th>Correo</th><th>Teléfono</th><th>Documento</th>{puedeVerPresupuestos && <th>Presupuestos</th>}<th><span className="sr">Acciones</span></th></tr></thead>
      <tbody>
        {clients === null && <CargandoFilas columnas={puedeVerPresupuestos ? 6 : 5} />}
        {clients !== null && clients.length > 0 && visibleClients.length === 0 && <tr className="fila-vacia"><td className="vacio" colSpan={puedeVerPresupuestos ? 6 : 5}>No hay clientes que coincidan con «{search.trim()}».</td></tr>}
        {visibleClients.map((client) => <tr key={client.id}>
          <td className="cliente-celda-nombre"><button className="link cliente-nombre" onClick={() => { setSelected(client); setQuotePage(0) }}>{client.nombre}</button></td>
          <td data-label="Correo">{client.email || <span className="sin-dato">—</span>}</td>
          <td data-label="Teléfono">{client.telefono || <span className="sin-dato">—</span>}</td>
          <td data-label="Documento">{client.documento || <span className="sin-dato">—</span>}</td>
          {puedeVerPresupuestos && <td data-label="Presupuestos" className="cliente-presupuestos">{resumenClientes.get(client.id)
            ? <><strong>{resumenClientes.get(client.id)!.cantidad}</strong><small>último {fechaCorta(resumenClientes.get(client.id)!.ultima)}</small></>
            : <span className="sin-dato">Ninguno</span>}</td>}
          <td className="acciones"><button className="link" onClick={() => setEditing(client)}>Editar</button><button className="link peligro" onClick={() => void remove(client)}>Eliminar</button></td>
        </tr>)}
      </tbody>
    </table></div>
    )}
    {editing && <ClientForm client={editing === 'new' ? null : editing} close={() => setEditing(null)} saved={async () => {
      setEditing(null)
      avisar('Listo, cliente guardado.')
      const fresh = await repositorio.clientes.listar()
      setClients(fresh)
    }} />}
  </main></Layout>
}

function ClientForm({ client, close, saved }: { client: Cliente | null; close: () => void; saved: () => Promise<void> }) {
  const [form, setForm] = useState(client ? {
    nombre: client.nombre, email: client.email, telefono: client.telefono,
    documento: client.documento ?? '', direccion: client.direccion ?? '',
  } : blankClient)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Ventana modal: fondo atenuado, foco adentro y se cierra con Esc o tocando afuera.
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal() }, [])
  const change = (key: keyof typeof blankClient, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.nombre.trim()) return setError('Ingresá el nombre del cliente.')
    setSaving(true); setError('')
    try {
      if (client) await repositorio.clientes.actualizar(client.id, form)
      else await repositorio.clientes.crear(form)
      await saved()
    } catch (reason) { setError(mensajeError(reason, 'No se pudo guardar el cliente.')) }
    finally { setSaving(false) }
  }
  return <dialog ref={ref} className="ventana" onClose={close} {...cerrarConFondo(() => { if (!saving) ref.current?.close() })}><form className="form" onSubmit={(event) => void submit(event)}>
    <h2>{client ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <label className="campo">Nombre y apellido<input value={form.nombre} onChange={(e) => change('nombre', e.target.value)} autoFocus required maxLength={160} /></label>
    <div className="dos">
      <label className="campo">Correo electrónico<input type="email" value={form.email} onChange={(e) => change('email', e.target.value)} /></label>
      <label className="campo">Teléfono<input value={form.telefono} onChange={(e) => change('telefono', e.target.value)} /></label>
      <label className="campo">DNI / CUIT / CUIL<input value={form.documento} onChange={(e) => change('documento', e.target.value)} /></label>
      <label className="campo">Dirección<input value={form.direccion} onChange={(e) => change('direccion', e.target.value)} /></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="botones"><button type="button" className="btn sec chico" onClick={close} disabled={saving}>Cancelar</button><button className="btn chico" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cliente'}</button></div>
  </form></dialog>
}
