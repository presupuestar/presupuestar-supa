import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { GraficoBarras } from '../components/GraficoBarras'
import { GraficoCircular, type ColorSegmento } from '../components/GraficoCircular'
import { tienePermiso, useSesion } from '../context/Sesion'
import { repositorio } from '../lib/repositorio'
import { fechaCorta, importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { mensajeError } from '../lib/errores'
import { ETIQUETA, fechaVigencia, opcionesEstado, presupuestoCaducado, sePuedeEditar } from '../lib/estados'
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
  const puedeEliminar = (presupuesto: Presupuesto) =>
    tienePermiso(usuario, 'quotes.delete_own') && (esAdmin || presupuesto.vendedor === usuario?.id)
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
  const resumenPeriodo = useMemo(() => {
    const acumulados = new Map<string, {
      mes: string
      moneda: string
      cantidad: number
      presupuestado: number
      aceptado: number
      rechazado: number
      pendiente: number
      ganancia: number
    }>()
    for (const fila of resumen) {
      if (mes && fila.mes !== mes) continue
      const moneda = normalizarMoneda(fila.moneda)
      const actual = acumulados.get(moneda) ?? {
        mes: fila.mes, moneda, cantidad: 0, presupuestado: 0, aceptado: 0, rechazado: 0, pendiente: 0, ganancia: 0,
      }
      actual.cantidad += fila.cantidad
      actual.presupuestado += fila.presupuestado
      actual.aceptado += fila.aceptado
      actual.rechazado += fila.rechazado
      actual.pendiente += fila.pendiente
      actual.ganancia += fila.ganancia
      acumulados.set(moneda, actual)
    }
    return [...acumulados.values()]
  }, [resumen, mes])
  const tendencias = useMemo(() => [...new Set(resumen.map((fila) => normalizarMoneda(fila.moneda)))].map((moneda) => ({
    moneda,
    datos: resumen
      .filter((fila) => normalizarMoneda(fila.moneda) === moneda)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12)
      .map((fila) => ({
        clave: fila.mes,
        etiqueta: nombreMes(fila.mes),
        valor: fila.presupuestado,
        valorTexto: importeEnMoneda(fila.presupuestado, fila.moneda),
        color: `mes-${Number(fila.mes.slice(5, 7))}` as ColorSegmento,
      })),
  })), [resumen])
  // Ranking de ventas por persona (solo lo ve el administrador). Respeta el mes elegido en el resumen.
  const ranking = useMemo(() => repositorio.resumenPorVendedor((lista ?? []).filter((p) => !mes || mesDe(p) === mes)), [lista, mes])
  const ventasPorMoneda = useMemo(() => [...new Set(ranking.map((fila) => normalizarMoneda(fila.moneda)))].map((moneda) => ({
    moneda,
    datos: ranking
      .filter((fila) => normalizarMoneda(fila.moneda) === moneda && fila.vendido > 0)
      .map((fila, index) => ({
        clave: fila.clave,
        etiqueta: fila.nombre,
        valor: fila.vendido,
        valorTexto: importeEnMoneda(fila.vendido, fila.moneda),
        color: `vendedor-${(index % 8) + 1}` as ColorSegmento,
      })),
  })), [ranking])
  const vendedores = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of lista ?? []) m.set(p.vendedorEmail || '', p.vendedorNombre || p.vendedorEmail || 'Sin asignar')
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [lista])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (lista ?? []).filter((p) => {
      const caducado = presupuestoCaducado(p, empresa?.validezDias, ahora)
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
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar el presupuesto.')) }
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
            <p className="sub">{esAdmin ? 'Presupuestos de la empresa.' : 'Tus presupuestos.'}</p>
          </div>
          <Link className="btn chico" to="/nuevo">Nuevo presupuesto</Link>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <SeccionDesplegable titulo={<>Resumen visual <span className="periodo">{mes ? nombreMes(mes) : 'todo el historial'}</span></>}>
          {resumen.length === 0 ? (
            <p className="vacio-linea">Sin datos en este período.</p>
          ) : (
            <>
              <div className="graficos-circulares">
                {resumenPeriodo.map((r) => (
                  <GraficoCircular
                    key={r.moneda}
                    titulo={`Estado de presupuestos · ${r.moneda}`}
                    total={importeEnMoneda(r.presupuestado, r.moneda)}
                    detalle={{ etiqueta: 'Ganancia de aceptados', importe: importeEnMoneda(r.ganancia, r.moneda) }}
                    segmentos={[
                      { etiqueta: 'Aceptado', valor: r.aceptado, importe: importeEnMoneda(r.aceptado, r.moneda), color: 'aceptado' },
                      { etiqueta: 'Pendiente', valor: r.pendiente, importe: importeEnMoneda(r.pendiente, r.moneda), color: 'pendiente' },
                      { etiqueta: 'Rechazado', valor: r.rechazado, importe: importeEnMoneda(r.rechazado, r.moneda), color: 'rechazado' },
                    ]}
                  />
                ))}
              </div>
              <div className="graficos-barras">
                {tendencias.map((tendencia) => (
                  <GraficoBarras
                    key={tendencia.moneda}
                    titulo={`Presupuestado por mes · ${tendencia.moneda}`}
                    datos={tendencia.datos}
                    seleccionado={mes}
                    alSeleccionar={(clave) => setMes(mes === clave ? null : clave)}
                  />
                ))}
              </div>
            </>
          )}
        </SeccionDesplegable>

        {esAdmin && (
          <SeccionDesplegable titulo={<>Ventas por empleado <span className="periodo">{mes ? nombreMes(mes) : 'todo el historial'}</span></>}>
            {!ranking.some((fila) => fila.vendido > 0) ? (
              <p className="vacio-linea">Sin ventas aceptadas en este período.</p>
            ) : (
              <>
                <div className="graficos-barras">
                  {ventasPorMoneda.filter((grupo) => grupo.datos.length > 0).map((grupo) => (
                    <GraficoBarras
                      key={grupo.moneda}
                      titulo={`Ventas aceptadas · ${grupo.moneda}`}
                      datos={grupo.datos}
                      seleccionado={vendedor === 'todos' ? null : vendedor}
                      alSeleccionar={(clave) => setVendedor(vendedor === clave ? 'todos' : clave)}
                    />
                  ))}
                </div>
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
                    {presupuestoCaducado(p, empresa?.validezDias, ahora)
                      ? <><span className="pill caducado" aria-label={`Presupuesto ${p.numero} caducado`}>Caducado · venció el {fechaCorta(fechaVigencia(p.fechaEmision, p.validezDias ?? empresa?.validezDias, p.vigenteHasta))}</span><select className={`estado-sel ${p.estado}`} value={p.estado} aria-label={`Cambiar estado del presupuesto ${p.numero}`}
                        onChange={(e) => cambiarEstado(p, e.target.value as Estado)}>
                        {opcionesEstado(p.estado).map((o) => <option key={o.valor + o.texto} value={o.valor}>{o.texto}</option>)}
                      </select></>
                      : <select className={`estado-sel ${p.estado}`} value={p.estado} aria-label={`Estado del presupuesto ${p.numero}`}
                      onChange={(e) => cambiarEstado(p, e.target.value as Estado)}>
                      {opcionesEstado(p.estado).map((o) => <option key={o.valor + o.texto} value={o.valor}>{o.texto}</option>)}
                    </select>}
                  </td>
                  <td className="campo-acciones">
                    <div className="acciones-historial">
                      <button className="accion-historial" disabled={generando === p.id} onClick={() => descargar(p)}>{generando === p.id ? 'Generando…' : 'PDF'}</button>
                      {sePuedeEditar(p.estado) && <Link className="accion-historial" to={`/presupuestos/${p.id}/editar`}>Editar</Link>}
                      {puedeEliminar(p) && <button className="accion-historial peligro" onClick={() => eliminar(p)}>Eliminar</button>}
                    </div>
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
