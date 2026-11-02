import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useSesion } from '../context/Sesion'
import { repositorio } from '../lib/repositorio'
import { fechaCorta, importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { mensajeError } from '../lib/errores'
import { ETIQUETA, estaVencido, opcionesEstado, sePuedeEditar } from '../lib/estados'
import { generarPdf, nombreArchivo } from '../lib/pdf/generar'
import type { Estado, Presupuesto } from '../lib/tipos'

const mesDe = (p: Presupuesto) => (p.fechaEmision || p.created).slice(0, 7)
const nombreMes = (aaaamm: string) => {
  const t = new Date(aaaamm + '-15').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function SeccionDesplegable({ titulo, children }: { titulo: React.ReactNode; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 820px)').matches)
  const panelId = useId()
  return (
    <section className="resumen seccion-desplegable">
      <h2>
        <button className="seccion-boton" type="button" aria-expanded={abierto} aria-controls={panelId} onClick={() => setAbierto(!abierto)}>
          <span>{titulo}</span>
          <span className="seccion-icono" aria-hidden="true" />
        </button>
      </h2>
      <div id={panelId} className={`seccion-contenido${abierto ? ' abierto' : ''}`} aria-hidden={!abierto}>
        <div className="seccion-interior" inert={!abierto}>{children}</div>
      </div>
    </section>
  )
}

export function Historial() {
  const { empresa, usuario } = useSesion()
  const esAdmin = usuario?.rol === 'admin'
  const [lista, setLista] = useState<Presupuesto[] | null>(null)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todos' | Estado | 'caducado'>('todos')
  const [mes, setMes] = useState<string | null>(() => {
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  })
  const [vendedor, setVendedor] = useState('todos')
  const [generando, setGenerando] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const siguienteDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1)
    const temporizador = window.setTimeout(() => setAhora(new Date()), siguienteDia.getTime() - ahora.getTime())
    return () => window.clearTimeout(temporizador)
  }, [ahora])

  const cargar = () =>
    repositorio.presupuestos.listar()
      .then(setLista)
      .catch((e) => { setLista([]); setError(mensajeError(e, 'No se pudo cargar el historial.')) })
  useEffect(() => { cargar() }, [])

  const resumen = useMemo(() => repositorio.resumenMensual(lista ?? []), [lista])
  // Ranking de ventas por persona (solo lo ve el administrador). Respeta el mes elegido en el resumen.
  const ranking = useMemo(() => repositorio.resumenPorVendedor((lista ?? []).filter((p) => !mes || mesDe(p) === mes)), [lista, mes])
  const vendedores = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of lista ?? []) m.set(p.vendedorEmail || '', p.vendedorNombre || p.vendedorEmail || 'Sin asignar')
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [lista])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (lista ?? []).filter((p) => {
      const caducado = p.estado === 'pendiente' && estaVencido(p.fechaEmision, p.validezDias ?? empresa?.validezDias, ahora)
      if (estado === 'caducado' ? !caducado : estado !== 'todos' && p.estado !== estado) return false
      if (mes && mesDe(p) !== mes) return false
      if (vendedor !== 'todos' && (p.vendedorEmail || '') !== vendedor) return false
      if (!q) return true
      const c = p.clienteDatos
      return `${p.numero} ${String(p.numero).padStart(4, '0')} ${c?.nombre ?? ''} ${c?.email ?? ''} ${c?.telefono ?? ''} ${c?.documento ?? ''}`.toLowerCase().includes(q)
    })
  }, [lista, busqueda, estado, mes, vendedor, ahora, empresa?.validezDias])

  const cols = 7
  const totalVisible = useMemo(() => {
    const total = new Map<string, number>()
    for (const p of visibles) {
      const moneda = normalizarMoneda(p.moneda)
      total.set(moneda, (total.get(moneda) ?? 0) + p.total)
    }
    return [...total.entries()]
  }, [visibles])

  const cambiarEstado = async (p: Presupuesto, nuevo: Estado) => {
    setError('')
    try { await repositorio.presupuestos.cambiarEstado(p.id, nuevo); await cargar() }
    catch (e) {
      const base = mensajeError(e, 'No se pudo cambiar el estado.')
      setError(p.estado === 'borrador' ? `${base} Abrí el borrador con "Editar" para completar los datos y emitirlo.` : base)
      await cargar()
    }
  }

  const eliminar = async (p: Presupuesto) => {
    if (!confirm(`¿Eliminar el presupuesto N° ${String(p.numero).padStart(4, '0')}?\n\nEsta acción no se puede deshacer.`)) return
    try { await repositorio.presupuestos.eliminar(p.id); await cargar() }
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar el borrador.')) }
  }

  const descargar = async (p: Presupuesto) => {
    if (!empresa) return
    setGenerando(p.id); setError('')
    try {
      const blob = await generarPdf(p, empresa)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nombreArchivo(p); document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch { setError('No se pudo generar el PDF. Probá de nuevo.') }
    finally { setGenerando(null) }
  }

  return (
    <Layout>
      <main className="contenido ancho">
        <div className="encabezado">
          <div>
            <h1>Historial</h1>
            <p className="sub">{esAdmin
              ? 'Todos los presupuestos de la empresa y quién hizo cada uno: descargá el PDF, editá los que aún no tuvieron respuesta y marcá si fueron aceptados o rechazados.'
              : 'Los presupuestos que hiciste vos: descargá el PDF, editá los que aún no tuvieron respuesta y marcá si fueron aceptados o rechazados.'}</p>
          </div>
          <Link className="btn chico" to="/nuevo">Nuevo presupuesto</Link>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <SeccionDesplegable titulo="Resumen mensual">
          {resumen.length === 0 ? (
            <p className="vacio-linea">Cuando emitas presupuestos, acá vas a ver cuánto presupuestaste cada mes, cuánto te aceptaron, la ganancia mensual de los presupuestos aceptados y tu tasa de conversión.</p>
          ) : (
            <>
              <div className="tabla-caja">
                <table className="tabla resumen-tabla">
                  <thead><tr><th>Mes</th><th className="num">Presupuestos</th><th className="num">Presupuestado</th><th className="num">Aceptado</th><th className="num">Ganancia mensual</th><th className="num">Rechazado</th><th className="num">Pendiente</th><th className="num">Conversión</th></tr></thead>
                  <tbody>
                    {resumen.map((r) => (
                      <tr key={`${r.mes}-${r.moneda}`} className={mes === r.mes ? 'sel' : ''} onClick={() => setMes(mes === r.mes ? null : r.mes)} title="Tocá para filtrar la lista por este mes">
                        <td data-label="Mes"><strong>{nombreMes(r.mes)} ({normalizarMoneda(r.moneda)})</strong></td>
                        <td data-label="Presupuestos" className="num">{r.cantidad}</td>
                        <td data-label="Presupuestado" className="num">{importeEnMoneda(r.presupuestado, r.moneda)}</td>
                        <td data-label="Aceptado" className="num ok">{importeEnMoneda(r.aceptado, r.moneda)}</td>
                        <td data-label="Ganancia mensual" className="num ok">{importeEnMoneda(r.ganancia, r.moneda)}</td>
                        <td data-label="Rechazado" className="num no">{importeEnMoneda(r.rechazado, r.moneda)}</td>
                        <td data-label="Pendiente" className="num pe">{importeEnMoneda(r.pendiente, r.moneda)}</td>
                        <td data-label="Conversión" className="num conv">{r.conversionPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ayuda">Conversión = presupuestos aceptados sobre los emitidos en el mes (los borradores no cuentan). Tocá un mes para filtrar la lista.</p>
            </>
          )}
        </SeccionDesplegable>

        {esAdmin && (
          <SeccionDesplegable titulo={<>Ventas por empleado <span className="periodo">{mes ? nombreMes(mes) : 'todo el historial'}</span></>}>
            {ranking.length === 0 ? (
              <p className="vacio-linea">Todavía no hay presupuestos emitidos {mes ? 'en este mes' : ''}.</p>
            ) : (
              <>
                <div className="tabla-caja">
                  <table className="tabla resumen-tabla ranking">
                    <thead><tr><th>#</th><th>Empleado</th><th className="num">Emitidos</th><th className="num">Aceptados</th><th className="num">Vendido</th><th className="num">Presupuestado</th><th className="num">Rechazado</th><th className="num">Pendiente</th><th className="num">Conversión</th></tr></thead>
                    <tbody>
                      {ranking.map((r) => {
                        const puesto = r.clave === '' ? 0 : ranking.filter((x) => x.clave !== '').indexOf(r) + 1
                        return (
                        <tr key={`${r.clave || 'sin-asignar'}-${r.moneda}`} onClick={() => setVendedor(vendedor === r.clave ? 'todos' : r.clave)} className={vendedor === r.clave ? 'sel' : ''} title="Tocá para ver solo sus presupuestos">
                          <td data-label="#">{puesto || '—'}</td>
                          <td data-label="Empleado"><strong>{r.nombre}</strong><small>{normalizarMoneda(r.moneda)}</small>{puesto === 1 && r.vendido > 0 && <span className="pill pers">Más ventas</span>}{r.clave === '' && <small>Presupuestos anteriores al registro de vendedores</small>}</td>
                          <td data-label="Emitidos" className="num">{r.cantidad}</td>
                          <td data-label="Aceptados" className="num">{r.aceptados}</td>
                          <td data-label="Vendido" className="num ok">{importeEnMoneda(r.vendido, r.moneda)}</td>
                          <td data-label="Presupuestado" className="num">{importeEnMoneda(r.presupuestado, r.moneda)}</td>
                          <td data-label="Rechazado" className="num no">{importeEnMoneda(r.rechazado, r.moneda)}</td>
                          <td data-label="Pendiente" className="num pe">{importeEnMoneda(r.pendiente, r.moneda)}</td>
                          <td data-label="Conversión" className="num conv">{r.conversionPct}%</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="ayuda">"Vendido" es el total de los presupuestos que el cliente aceptó. Los borradores no cuentan. Tocá un mes del resumen para ver el ranking de ese mes, o una persona para filtrar la lista.</p>
              </>
            )}
          </SeccionDesplegable>
        )}

        <div className="filtros">
          <input type="search" placeholder="Buscar cliente o número…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar presupuesto" />
          <select value={estado} onChange={(e) => setEstado(e.target.value as 'todos' | Estado)} aria-label="Filtrar por estado" className="filtro-estado">
            <option value="todos">Todos los estados</option>
            <option value="caducado">Caducados</option>
            {(Object.keys(ETIQUETA) as Estado[]).map((e) => <option key={e} value={e}>{ETIQUETA[e]}</option>)}
          </select>
          {esAdmin && vendedores.length > 0 && (
            <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Filtrar por empleado" className="filtro-estado">
              <option value="todos">Todos los empleados</option>
              {vendedores.map(([clave, nombre]) => <option key={clave || 'sin'} value={clave}>{nombre}</option>)}
            </select>
          )}
          {mes && <button className="link" onClick={() => setMes(null)}>Quitar filtro: {nombreMes(mes)}</button>}
        </div>

        <div className="tabla-caja historial-caja">
          <table className="tabla tabla-historial">
            <thead><tr><th>Cliente</th><th>N°</th><th>Fecha</th><th>Vendedor</th><th className="num">Total</th><th>Estado</th><th><span className="sr">Acciones</span></th></tr></thead>
            <tbody>
              {lista === null && <tr><td colSpan={cols} className="vacio">Cargando…</td></tr>}
              {lista !== null && visibles.length === 0 && (
                <tr><td colSpan={cols} className="vacio">{lista.length === 0 ? 'Todavía no hay presupuestos. Creá el primero.' : 'No hay presupuestos que coincidan con el filtro.'}</td></tr>
              )}
              {visibles.map((p) => (
                <tr key={p.id}>
                  <td className="campo-cliente" data-label="Cliente">
                    <strong>{p.clienteDatos?.nombre || 'Sin completar'}</strong>
                    <small>{[p.clienteDatos?.email, p.clienteDatos?.telefono].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td className="campo-numero" data-label="N°"><strong>{String(p.numero).padStart(4, '0')}</strong></td>
                  <td className="campo-fecha" data-label="Fecha">{fechaCorta(p.fechaEmision || p.created)}</td>
                  <td className="campo-vendedor" data-label="Vendedor">{p.vendedorNombre || <span className="sin-dato">Sin asignar</span>}</td>
                  <td className="campo-total num" data-label="Total">{importeEnMoneda(p.total, p.moneda)}</td>
                  <td className="campo-estado" data-label="Estado">
                    {p.estado === 'pendiente' && estaVencido(p.fechaEmision, p.validezDias ?? empresa?.validezDias, ahora)
                      ? <><span className="pill caducado" aria-label={`Presupuesto ${p.numero} caducado`}>Caducado</span><select className={`estado-sel ${p.estado}`} value={p.estado} aria-label={`Cambiar estado del presupuesto ${p.numero}`}
                        onChange={(e) => cambiarEstado(p, e.target.value as Estado)}>
                        {opcionesEstado(p.estado).map((o) => <option key={o.valor + o.texto} value={o.valor}>{o.texto}</option>)}
                      </select></>
                      : <select className={`estado-sel ${p.estado}`} value={p.estado} aria-label={`Estado del presupuesto ${p.numero}`}
                      onChange={(e) => cambiarEstado(p, e.target.value as Estado)}>
                      {opcionesEstado(p.estado).map((o) => <option key={o.valor + o.texto} value={o.valor}>{o.texto}</option>)}
                    </select>}
                  </td>
                  <td className="acciones campo-acciones">
                    <button className="accion-historial" disabled={generando === p.id} onClick={() => descargar(p)}>{generando === p.id ? 'Generando…' : 'PDF'}</button>
                    {sePuedeEditar(p.estado) && <Link className="accion-historial" to={`/presupuestos/${p.id}/editar`}>Editar</Link>}
                    <button className="accion-historial peligro" onClick={() => eliminar(p)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {visibles.length > 0 && (
              <tfoot><tr><td colSpan={4}>{visibles.length} presupuesto{visibles.length === 1 ? '' : 's'}</td><td className="num">{totalVisible.map(([moneda, total]) => <div key={moneda}>{importeEnMoneda(total, moneda)}</div>)}</td><td colSpan={2} /></tr></tfoot>
            )}
          </table>
        </div>
      </main>
    </Layout>
  )
}
