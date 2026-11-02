import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { repositorio } from '../lib/repositorio'
import { formatearImporte, importeEnMoneda, normalizarMoneda, parseImporte } from '../lib/formato'
import { mensajeError } from '../lib/errores'
import type { Item } from '../lib/tipos'

const UNIDADES = ['unidad', 'hora', 'día', 'mes', 'año', 'm²', 'kg']
const ITEMS_CATALOGO_POR_PAGINA = 30
const ITEMS_IMPORTACION_POR_PAGINA = 100
const normalizarClave = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
const claveImportacion = (nombre: string, proveedor: string) =>
  `${normalizarClave(nombre)}|${normalizarClave(proveedor)}`
const claveFilaPdf = (nombre: string, precio: number, moneda: string) =>
  `${normalizarClave(nombre)}|${precio}|${normalizarMoneda(moneda)}`

function mensajeErrorImportacion(e: unknown): string {
  if (e instanceof Error) return e.message
  return mensajeError(e, 'No se pudo sincronizar el ítem.')
}

function verificarMonedaPersistida(monedaGuardada: string | undefined, monedaEsperada: string) {
  if (normalizarMoneda(monedaGuardada) !== normalizarMoneda(monedaEsperada)) {
    throw new Error(`El servidor no guardó la moneda ${normalizarMoneda(monedaEsperada)}. Aplicá las migraciones de PocketBase y volvé a importar; el ítem no se considera sincronizado.`)
  }
}

interface CandidatoImportacion {
  key: string
  nombre: string
  precio: string
  moneda: string
  seleccionado: boolean
  error?: string
}

export function Catalogo() {
  const pdfInput = useRef<HTMLInputElement>(null)
  const revisionFinal = useRef<HTMLDivElement>(null)
  const confirmacionRef = useRef<HTMLDialogElement>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPaginasItems, setTotalPaginasItems] = useState(0)
  const [cargandoItems, setCargandoItems] = useState(true)
  const [actualizacionItems, setActualizacionItems] = useState(0)
  const [soloSinProveedor, setSoloSinProveedor] = useState(false)
  const secuenciaCargaItems = useRef(0)
  const itemsSeleccionadosCache = useRef(new Map<string, Item>())
  const importadorPdf = useRef<HTMLDetailsElement>(null)
  const [busqueda, setBusqueda] = useState('')
  const [paginaItems, setPaginaItems] = useState(0)
  const [paginaCandidatos, setPaginaCandidatos] = useState(0)
  const [proveedor, setProveedor] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState<Item | 'nuevo' | null>(null)
  const [error, setError] = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => new Set())
  const [procesandoLote, setProcesandoLote] = useState(false)
  const [confirmarEliminacion, setConfirmarEliminacion] = useState(false)
  const [proveedorSeleccion, setProveedorSeleccion] = useState('')
  const [archivoPdf, setArchivoPdf] = useState<File | null>(null)
  const [proveedorPdf, setProveedorPdf] = useState('')
  const [candidatos, setCandidatos] = useState<CandidatoImportacion[]>([])
  const [leyendoPdf, setLeyendoPdf] = useState(false)
  const [guardandoPdf, setGuardandoPdf] = useState(false)
  const [progresoLectura, setProgresoLectura] = useState('')
  const [progresoGuardado, setProgresoGuardado] = useState('')
  const [mensajeImportacion, setMensajeImportacion] = useState('')

  const cargar = () => setActualizacionItems((actual) => actual + 1)
  useEffect(() => {
    let vigente = true
    const secuencia = ++secuenciaCargaItems.current
    setCargandoItems(true)
    const temporizador = window.setTimeout(() => {
      repositorio.items.listarPagina({
        pagina: paginaItems + 1,
        porPagina: ITEMS_CATALOGO_POR_PAGINA,
        soloActivos: !verInactivos,
        busqueda,
        proveedor,
        sinProveedor: soloSinProveedor,
      }).then((resultado) => {
        if (!vigente || secuencia !== secuenciaCargaItems.current) return
        for (const item of resultado.items) {
          if (itemsSeleccionadosCache.current.has(item.id)) itemsSeleccionadosCache.current.set(item.id, item)
        }
        setItems(resultado.items)
        setTotalItems(resultado.totalItems)
        setTotalPaginasItems(resultado.totalPages)
        setError('')
        setPaginaItems((pagina) => Math.min(pagina, Math.max(0, resultado.totalPages - 1)))
      }).catch((e) => {
        if (!vigente || secuencia !== secuenciaCargaItems.current) return
        setItems([])
        setTotalItems(0)
        setTotalPaginasItems(0)
        setError(mensajeError(e, 'No se pudo cargar el catálogo.'))
      }).finally(() => {
        if (vigente && secuencia === secuenciaCargaItems.current) setCargandoItems(false)
      })
    }, 250)
    return () => {
      vigente = false
      window.clearTimeout(temporizador)
    }
  }, [paginaItems, busqueda, proveedor, soloSinProveedor, verInactivos, actualizacionItems])
  useEffect(() => {
    setPaginaCandidatos((pagina) => Math.min(pagina, Math.max(0, Math.ceil(candidatos.length / ITEMS_IMPORTACION_POR_PAGINA) - 1)))
  }, [candidatos.length])
  useEffect(() => { setPaginaItems(0) }, [busqueda, proveedor, soloSinProveedor, verInactivos])
  useEffect(() => {
    const dialogo = confirmacionRef.current
    if (confirmarEliminacion && dialogo && !dialogo.open) dialogo.showModal()
    else if (!confirmarEliminacion && dialogo?.open) dialogo.close()
  }, [confirmarEliminacion])

  const proveedores = useMemo(() => [...new Set((items ?? []).map((i) => i.proveedor?.trim()).filter((p): p is string => Boolean(p)))].sort((a, b) => a.localeCompare(b)), [items])
  const mayoristaImportacion = proveedorPdf.trim()
  const visibles = items ?? []
  const secciones = useMemo(() => {
    const grupos = new Map<string, Item[]>()
    for (const item of visibles) {
      const clave = item.proveedor?.trim() || 'Sin proveedor'
      const grupo = grupos.get(clave)
      if (grupo) grupo.push(item)
      else grupos.set(clave, [item])
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visibles])
  const todosVisiblesSeleccionados = visibles.length > 0 && visibles.every((i) => seleccionados.has(i.id))
  const cantidadSeleccionada = seleccionados.size

  const alternar = async (i: Item) => {
    try { await repositorio.items.actualizar(i.id, { activo: !i.activo }); cargar() }
    catch (e) { setError(mensajeError(e, 'No se pudo cambiar el estado del ítem.')) }
  }
  const eliminar = async (i: Item) => {
    if (!confirm(`¿Eliminar "${i.nombre}" del catálogo?\n\nLos presupuestos ya hechos no cambian. Si solo querés dejar de usarlo, es mejor desactivarlo.`)) return
    try { await repositorio.items.eliminar(i.id); cargar() }
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar el ítem.')) }
  }

  const seleccionarVisibles = (seleccionar: boolean) => {
    setConfirmarEliminacion(false)
    setSeleccionados((actuales) => {
      const nuevos = new Set(actuales)
      for (const item of visibles) {
        if (seleccionar) {
          nuevos.add(item.id)
          itemsSeleccionadosCache.current.set(item.id, item)
        } else {
          nuevos.delete(item.id)
          itemsSeleccionadosCache.current.delete(item.id)
        }
      }
      return nuevos
    })
  }

  const cambiarSeleccion = (item: Item, marcar: boolean) => {
    setConfirmarEliminacion(false)
    setSeleccionados((actuales) => {
      const nuevos = new Set(actuales)
      if (marcar) {
        nuevos.add(item.id)
        itemsSeleccionadosCache.current.set(item.id, item)
      } else {
        nuevos.delete(item.id)
        itemsSeleccionadosCache.current.delete(item.id)
      }
      return nuevos
    })
  }

  const quitarSeleccion = () => {
    itemsSeleccionadosCache.current.clear()
    setSeleccionados(new Set())
  }

  const ejecutarSeleccion = async (accion: 'activar' | 'desactivar' | 'eliminar' | 'proveedor') => {
    const objetivos = [...seleccionados]
      .map((id) => itemsSeleccionadosCache.current.get(id))
      .filter((item): item is Item => Boolean(item))
    if (objetivos.length === 0 || procesandoLote) return
    if (objetivos.length !== seleccionados.size) {
      return setError('No se pudieron recuperar todos los ítems seleccionados. Quitá la selección y volvé a seleccionarlos.')
    }
    if (accion === 'proveedor' && !proveedorSeleccion.trim()) return setError('Escribí el nombre del proveedor para asignarlo a los ítems seleccionados.')
    if (accion === 'eliminar' && !confirmarEliminacion) {
      setConfirmarEliminacion(true)
      return
    }

    setConfirmarEliminacion(false)
    setProcesandoLote(true)
    setError('')
    const fallidos: { item: Item; error: string }[] = []
    const completados: string[] = []
    try {
      for (let inicio = 0; inicio < objetivos.length; inicio += 5) {
        const lote = objetivos.slice(inicio, inicio + 5)
        const resultados = await Promise.allSettled(lote.map(async (item) => {
          if (accion === 'eliminar') await repositorio.items.eliminar(item.id)
          else if (accion === 'proveedor') await repositorio.items.actualizar(item.id, { proveedor: proveedorSeleccion.trim() })
          else await repositorio.items.actualizar(item.id, { activo: accion === 'activar' })
          return item.id
        }))
        resultados.forEach((resultado, indice) => {
          const item = lote[indice]
          if (resultado.status === 'fulfilled') completados.push(item.id)
          else fallidos.push({ item, error: mensajeError(resultado.reason, 'No se pudo actualizar el ítem.') })
        })
      }

      setSeleccionados((actuales) => {
        const nuevos = new Set(actuales)
        for (const id of completados) {
          nuevos.delete(id)
          itemsSeleccionadosCache.current.delete(id)
        }
        return nuevos
      })
      await cargar()
      if (accion === 'proveedor' && fallidos.length === 0) {
        setSoloSinProveedor(false)
        setProveedor(proveedorSeleccion.trim())
        setPaginaItems(0)
      }
      if (fallidos.length > 0) {
        const detalle = fallidos.slice(0, 3).map(({ item, error: detalleError }) => `${item.nombre}: ${detalleError}`).join(' ')
        const estadoLote = fallidos.length === 1 ? '1 ítem no se pudo procesar' : `${fallidos.length} ítems no se pudieron procesar`
        setError(`${completados.length} ítem${completados.length === 1 ? '' : 's'} procesado${completados.length === 1 ? '' : 's'}; ${estadoLote}. ${detalle}${fallidos.length > 3 ? ' Hay más errores.' : ''}`)
      }
    } finally {
      setProcesandoLote(false)
    }
  }

  const procesarPdf = async () => {
    if (!archivoPdf) return setError('Elegí un archivo PDF para importar.')
    if (!mayoristaImportacion) return setError('Seleccioná un mayorista existente o escribí el nombre de uno nuevo antes de leer el PDF.')
    if (archivoPdf.type !== 'application/pdf' && !archivoPdf.name.toLowerCase().endsWith('.pdf')) return setError('El archivo seleccionado no es un PDF.')
    if (archivoPdf.size > 20 * 1024 * 1024) return setError('El PDF supera el máximo permitido de 20 MB.')
    setError('')
    setMensajeImportacion('')
    setCandidatos([])
    setPaginaCandidatos(0)
    setProgresoLectura('Preparando lector PDF…')
    setLeyendoPdf(true)
    try {
      const { leerMaterialesPdf } = await import('../lib/importarCatalogoPdf')
      const materiales = await leerMaterialesPdf(archivoPdf, ({ pagina, paginas }) => {
        setProgresoLectura(paginas === 0 ? 'Abriendo PDF…' : `Leyendo página ${pagina} de ${paginas}…`)
      })
      const materialesConPrecio = materiales.filter((material) =>
        material.nombre.trim() && Number.isFinite(material.precio) && material.precio >= 0)
      const descartados = materiales.length - materialesConPrecio.length
      if (materialesConPrecio.length === 0) {
        setError('No se encontraron filas con material y precio. Verificá que el PDF tenga texto seleccionable y que los precios estén al final de cada fila.')
      } else {
        const filasUnicas = new Map<string, typeof materiales[number]>()
        for (const material of materialesConPrecio) {
          const clave = claveFilaPdf(material.nombre, material.precio, material.moneda)
          if (!filasUnicas.has(clave)) filasUnicas.set(clave, material)
        }
        const repetidos = materialesConPrecio.length - filasUnicas.size
        setCandidatos([...filasUnicas.values()].map((m) => ({ key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, nombre: m.nombre, precio: formatearImporte(m.precio), moneda: normalizarMoneda(m.moneda), seleccionado: true })))
        const avisos = [
          repetidos > 0 ? `Se consolidaron ${repetidos} fila${repetidos === 1 ? '' : 's'} idéntica${repetidos === 1 ? '' : 's'}.` : '',
          descartados > 0 ? `Se descartaron ${descartados} fila${descartados === 1 ? '' : 's'} sin precio válido.` : '',
        ].filter(Boolean)
        if (avisos.length > 0) setMensajeImportacion(avisos.join(' '))
      }
    } catch (e) {
      const detalle = e instanceof Error && e.message
        ? e.message
        : mensajeError(e, 'No se pudo leer el PDF. Probá con un archivo PDF con texto seleccionable.')
      setError(detalle)
    } finally {
      setLeyendoPdf(false)
      setProgresoLectura('')
    }
  }

  const guardarImportacion = async () => {
    if (!mayoristaImportacion) return setError('Seleccioná un mayorista existente o escribí el nombre de uno nuevo antes de cargar los materiales.')
    const seleccionados = candidatos.filter((c) => c.seleccionado)
    if (seleccionados.length === 0) return setError('Seleccioná al menos un material para cargar.')
    const invalidos = seleccionados.find((c) => !c.nombre.trim() || !Number.isFinite(parseImporte(c.precio)) || parseImporte(c.precio) < 0)
    if (invalidos) return setError('Revisá los materiales seleccionados: cada uno necesita nombre e importe igual o mayor a 0.')

    setError('')
    setMensajeImportacion('')
    setGuardandoPdf(true)
    setProgresoGuardado(`Comparando 0 de ${seleccionados.length} ítems…`)
    let siguiente = 0
    let completados = 0
    let creados = 0
    let actualizados = 0
    const fallidos: { candidato: CandidatoImportacion; error: string }[] = []
    try {
      const existentes = await repositorio.items.buscarPorNombresYProveedor(
        seleccionados.map((candidato) => candidato.nombre),
        mayoristaImportacion,
      )
      const existentesPorClave = new Map<string, Item[]>()
      for (const item of existentes) {
        const clave = claveImportacion(item.nombre, item.proveedor ?? '')
        const grupo = existentesPorClave.get(clave)
        if (grupo) grupo.push(item)
        else existentesPorClave.set(clave, [item])
      }
      const gruposPorClave = new Map<string, CandidatoImportacion[]>()
      for (const candidato of seleccionados) {
        const clave = claveImportacion(candidato.nombre, mayoristaImportacion)
        const grupo = gruposPorClave.get(clave)
        if (grupo) grupo.push(candidato)
        else gruposPorClave.set(clave, [candidato])
      }
      const grupos = [...gruposPorClave.entries()]

      const trabajador = async () => {
        while (true) {
          const indice = siguiente++
          if (indice >= grupos.length) return
          const [clave, grupo] = grupos[indice]
          let registros = existentesPorClave.get(clave) ?? []
          const registrosUsados = new Set<string>()
          for (const material of grupo) {
            try {
              const datosPrecio = { precio: parseImporte(material.precio), moneda: material.moneda }
              const coincidenciasImporte = registros.filter((item) =>
                !registrosUsados.has(item.id) && item.precio === datosPrecio.precio)
              if (coincidenciasImporte.length > 0) {
                for (const coincideImporte of coincidenciasImporte) {
                  if (normalizarMoneda(coincideImporte.moneda) !== normalizarMoneda(datosPrecio.moneda)) {
                    const actualizado = await repositorio.items.actualizar(coincideImporte.id, { moneda: datosPrecio.moneda })
                    verificarMonedaPersistida(actualizado.moneda, datosPrecio.moneda)
                    registros = registros.map((item) => item.id === coincideImporte.id ? actualizado : item)
                    actualizados++
                  }
                  registrosUsados.add(coincideImporte.id)
                }
                continue
              }

              const existenteParaActualizar = registros.length === 1 && !registrosUsados.has(registros[0].id)
                ? registros[0]
                : undefined
              if (existenteParaActualizar) {
                const actualizado = await repositorio.items.actualizar(existenteParaActualizar.id, datosPrecio)
                verificarMonedaPersistida(actualizado.moneda, datosPrecio.moneda)
                registros = [actualizado]
                registrosUsados.add(existenteParaActualizar.id)
                actualizados++
              } else {
                const creado = await repositorio.items.crear({
                  nombre: material.nombre.trim(),
                  descripcion: '',
                  proveedor: mayoristaImportacion,
                  unidad: 'unidad',
                  ...datosPrecio,
                  activo: true,
                })
                verificarMonedaPersistida(creado.moneda, datosPrecio.moneda)
                registros = [...registros, creado]
                registrosUsados.add(creado.id)
                creados++
              }
              existentesPorClave.set(clave, registros)
            } catch (e) {
              fallidos.push({ candidato: material, error: mensajeErrorImportacion(e) })
            } finally {
              completados++
              if (completados % 100 === 0 || completados === seleccionados.length) {
                setProgresoGuardado(`Sincronizando ${completados} de ${seleccionados.length} ítems…`)
              }
            }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(5, grupos.length) }, () => trabajador()))
      await cargar()
      const fallidosIds = new Set(fallidos.map(({ candidato }) => candidato.key))
      const erroresPorId = new Map(fallidos.map(({ candidato, error }) => [candidato.key, error]))
      setCandidatos((actuales) => actuales
        .filter((c) => fallidosIds.has(c.key) || !c.seleccionado)
        .map((c) => {
          const error = erroresPorId.get(c.key)
          return { ...c, seleccionado: error ? false : c.seleccionado, error: error ?? c.error }
        }))
      const resumen = `${creados} nuevos y ${actualizados} actualizados`
      setMensajeImportacion(fallidos.length === 0
        ? `Sincronización completa: ${resumen} en el catálogo.`
        : `Sincronización parcial: ${resumen}; ${fallidos.length} ítems quedaron desmarcados para revisar. Podés seleccionar todos juntos para reintentar o elegir solo algunos.`)
      if (fallidos.length === 0) {
        setArchivoPdf(null)
        setProveedorPdf('')
      }
    } catch (e) {
      setError(mensajeError(e, 'No se pudo consultar el catálogo para sincronizar los ítems del PDF. No se modificó ningún ítem.'))
    } finally {
      setGuardandoPdf(false)
      setProgresoGuardado('')
    }
  }

  const rechazarLectura = () => {
    setCandidatos([])
    setArchivoPdf(null)
    if (pdfInput.current) pdfInput.current.value = ''
    setError('')
    setMensajeImportacion('Lectura descartada. No se agregó ningún material.')
  }

  return (
    <Layout>
      <main className="contenido">
        <div className="encabezado">
          <div>
            <h1>Catálogo</h1>
            <p className="sub">Los ítems que cargás una vez y después elegís al armar cada presupuesto.</p>
          </div>
          <div className="encabezado-acciones">
            <button type="button" className="btn chico" onClick={() => setEditando('nuevo')}>Nuevo ítem</button>
          </div>
        </div>

        <details className="panel importador-pdf catalogo-desplegable" id="pdf-catalogo" ref={importadorPdf}>
          <summary className="catalogo-desplegable-resumen" onClick={(e) => {
            if (leyendoPdf || guardandoPdf) e.preventDefault()
          }}>
            <span>
              <strong>Importar ítems desde PDF</strong>
              <small>{leyendoPdf
                ? progresoLectura || 'Leyendo PDF…'
                : guardandoPdf
                  ? progresoGuardado || 'Sincronizando ítems…'
                  : candidatos.length > 0
                    ? `${candidatos.length} ítems listos para revisar`
                    : 'Cargar o actualizar ítems del catálogo'}</small>
            </span>
            <span className="catalogo-desplegable-icono" aria-hidden="true" />
          </summary>
          <div className="importador-contenido">
          <div className="botones importador-acciones">
            <button type="button" className="btn sec chico" onClick={() => pdfInput.current?.click()}>Importar PDF</button>
          </div>
          <p className="ayuda">Leemos catálogos con texto seleccionable y detectamos filas que terminan en un precio. La moneda explícita del PDF (incluida la que aparece junto al precio) prevalece; al reimportar, también corregimos la moneda de registros existentes con el mismo nombre, mayorista e importe.</p>
          <div className="dos">
            <label className="campo">Archivo PDF
              <input ref={pdfInput} type="file" accept="application/pdf,.pdf" onChange={(e) => { setArchivoPdf(e.target.files?.[0] ?? null); setCandidatos([]); setError(''); setMensajeImportacion('') }} />
            </label>
            <label className="campo">Mayorista del catálogo <small>(obligatorio · uso interno)</small>
              <input required list="mayoristas-importacion" value={proveedorPdf} onChange={(e) => setProveedorPdf(e.target.value)} maxLength={160} placeholder="Elegí o escribí un mayorista…" />
              <datalist id="mayoristas-importacion">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
          </div>
          <div className="botones importador-acciones">
            <button type="button" className="btn sec chico" disabled={!archivoPdf || leyendoPdf || guardandoPdf} onClick={procesarPdf}>
              {leyendoPdf ? 'Leyendo PDF…' : 'Leer PDF'}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          {candidatos.length > 0 && (
            <>
              <div className="revision-importacion">
                <div>
                  <h3>Revisá los ítems detectados</h3>
                  <p className="ayuda">Se detectaron {candidatos.length} ítems con precio válido. Los que comparten nombre pero tienen distinto precio o moneda se agregan por separado automáticamente. Si el PDF no indica una moneda, se toma como ARS; las filas sin precio se descartan.</p>
                  {candidatos.some((c) => c.error) && <p className="error" role="alert">{candidatos.filter((c) => c.error).length} ítems requieren revisión. Están desmarcados: revisá el motivo y corregí los datos si hace falta. Podés seleccionar todos juntos para reintentarlos o marcar solo algunos.</p>}
                </div>
                <button type="button" className="btn sec chico" onClick={() => revisionFinal.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}>Ir al final para aprobar ↓</button>
              </div>
              {candidatos.some((c) => !c.seleccionado) && <div className="botones importador-acciones">
                <button type="button" className="btn sec chico" disabled={guardandoPdf || leyendoPdf} onClick={() => setCandidatos((actuales) => actuales.map((c) => ({ ...c, seleccionado: true })))}>
                  Seleccionar todos para reintentar
                </button>
              </div>}
              <div className="tabla-caja importacion-caja">
                <table className="tabla tabla-importacion">
                  <thead><tr><th>Incluir</th><th>Ítem</th><th className="num">Precio unitario</th><th>Moneda</th></tr></thead>
                  <tbody>
                    {candidatos.slice(paginaCandidatos * ITEMS_IMPORTACION_POR_PAGINA, (paginaCandidatos + 1) * ITEMS_IMPORTACION_POR_PAGINA).map((c) => (
                      <tr key={c.key} className={`${c.seleccionado ? '' : 'apagado'}${c.error ? ' importacion-fallida' : ''}`}>
                        <td><input type="checkbox" checked={c.seleccionado} aria-label={`Incluir ${c.nombre}`} onChange={(e) => setCandidatos((cs) => cs.map((x) => x.key === c.key ? { ...x, seleccionado: e.target.checked } : x))} /></td>
                        <td>
                          <input className="importacion-campo" aria-label="Nombre del ítem" value={c.nombre} onChange={(e) => setCandidatos((cs) => cs.map((x) => x.key === c.key ? { ...x, nombre: e.target.value } : x))} />
                          {c.error && <small className="importacion-error" role="alert"><strong>No se pudo cargar:</strong> {c.error}</small>}
                        </td>
                        <td><input className="importacion-campo precio" aria-label={`Precio de ${c.nombre}`} inputMode="decimal" value={c.precio} onChange={(e) => setCandidatos((cs) => cs.map((x) => x.key === c.key ? { ...x, precio: e.target.value } : x))} /></td>
                        <td><span className="pill pers">{c.moneda}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {candidatos.length > ITEMS_IMPORTACION_POR_PAGINA && <div className="paginacion-catalogo">
                <button type="button" className="btn sec chico" disabled={paginaCandidatos === 0} onClick={() => setPaginaCandidatos((pagina) => Math.max(0, pagina - 1))}>Anterior</button>
                <span>Ítems {paginaCandidatos * ITEMS_IMPORTACION_POR_PAGINA + 1}–{Math.min((paginaCandidatos + 1) * ITEMS_IMPORTACION_POR_PAGINA, candidatos.length)} de {candidatos.length}</span>
                <button type="button" className="btn sec chico" disabled={paginaCandidatos >= Math.ceil(candidatos.length / ITEMS_IMPORTACION_POR_PAGINA) - 1} onClick={() => setPaginaCandidatos((pagina) => pagina + 1)}>Siguiente</button>
              </div>}
              <div className="importacion-pie" ref={revisionFinal}>
                {mensajeImportacion && <p className="ok-msg" role="status">{mensajeImportacion}</p>}
                {guardandoPdf && <div className="importador-progreso" role="status" aria-live="polite">
                  <span className="indicador-carga" aria-hidden="true" />
                  <span>{progresoGuardado || 'Sincronizando ítems…'}</span>
                </div>}
                <div className="botones importador-acciones revision-acciones">
                  <button type="button" className="btn sec chico" disabled={guardandoPdf || leyendoPdf} onClick={rechazarLectura}>Cancelar revisión</button>
                  <button type="button" className="btn chico" disabled={guardandoPdf || leyendoPdf || candidatos.every((c) => !c.seleccionado)} onClick={guardarImportacion}>
                    {guardandoPdf ? 'Sincronizando…' : candidatos.some((c) => c.seleccionado && c.error)
                      ? `Reintentar y sincronizar ${candidatos.filter((c) => c.seleccionado).length} ítems`
                      : `Aprobar y sincronizar ${candidatos.filter((c) => c.seleccionado).length} ítems`}
                  </button>
                </div>
              </div>
            </>
          )}
          {leyendoPdf && <div className="importacion-pie importacion-lectura-pie" role="status" aria-live="polite">
            <div className="importador-progreso"><span className="indicador-carga" aria-hidden="true" /><span>{progresoLectura || 'Leyendo PDF…'}</span></div>
          </div>}
          {mensajeImportacion && candidatos.length === 0 && <p className="ok-msg" role="status">{mensajeImportacion}</p>}
          </div>
        </details>

        <div className="filtros">
          <input type="search" placeholder="Buscar ítem…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar ítem" />
          <input type="search" placeholder="Filtrar por proveedor…" value={proveedor} disabled={soloSinProveedor} onChange={(e) => setProveedor(e.target.value)} aria-label="Filtrar por proveedor" />
          <label className="check"><input type="checkbox" checked={soloSinProveedor} onChange={(e) => { setSoloSinProveedor(e.target.checked); if (e.target.checked) setProveedor('') }} /> Sin proveedor</label>
          <label className="check"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Mostrar desactivados</label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {totalItems > 0 && <div className="paginacion-catalogo catalogo-paginacion">
          <span>{paginaItems * ITEMS_CATALOGO_POR_PAGINA + 1}–{Math.min((paginaItems + 1) * ITEMS_CATALOGO_POR_PAGINA, totalItems)} de {totalItems} ítems</span>
          <button type="button" className="btn sec chico" disabled={cargandoItems || paginaItems === 0} onClick={() => setPaginaItems((pagina) => Math.max(0, pagina - 1))}>Anterior</button>
          <button type="button" className="btn sec chico" disabled={cargandoItems || paginaItems >= totalPaginasItems - 1} onClick={() => setPaginaItems((pagina) => Math.min(totalPaginasItems - 1, pagina + 1))}>Siguiente</button>
        </div>}

        <details className="acciones-catalogo-plegable catalogo-desplegable">
          <summary className="catalogo-desplegable-resumen">
            <span>
              <strong>Acciones de selección</strong>
              <small>{cantidadSeleccionada} ítem{cantidadSeleccionada === 1 ? '' : 's'} seleccionado{cantidadSeleccionada === 1 ? '' : 's'}</small>
            </span>
            <span className="catalogo-desplegable-icono" aria-hidden="true" />
          </summary>
          <div className="acciones-catalogo" aria-label="Acciones de selección">
          <div className="catalogo-seleccion">
            <span className="seleccion-conteo">{cantidadSeleccionada} seleccionado{cantidadSeleccionada === 1 ? '' : 's'} · {totalItems} resultado{totalItems === 1 ? '' : 's'}</span>
            <button type="button" className="btn sec chico" disabled={cargandoItems || visibles.length === 0 || todosVisiblesSeleccionados || procesandoLote || confirmarEliminacion} onClick={() => seleccionarVisibles(true)}>Seleccionar esta página</button>
            <button type="button" className="link" disabled={cantidadSeleccionada === 0 || procesandoLote || confirmarEliminacion} onClick={quitarSeleccion}>Quitar selección</button>
          </div>
          <div className="catalogo-acciones-lote">
            <span>Acciones para seleccionados</span>
            <button type="button" className="btn sec chico" disabled={cantidadSeleccionada === 0 || procesandoLote || confirmarEliminacion} onClick={() => ejecutarSeleccion('activar')}>Activar</button>
            <button type="button" className="btn sec chico" disabled={cantidadSeleccionada === 0 || procesandoLote || confirmarEliminacion} onClick={() => ejecutarSeleccion('desactivar')}>Desactivar</button>
            <div className="asignar-proveedor">
              <label className="sr" htmlFor="proveedor-seleccionados">Mayorista para los seleccionados</label>
              <input id="proveedor-seleccionados" value={proveedorSeleccion} onChange={(e) => setProveedorSeleccion(e.target.value)} maxLength={160} placeholder="Nombre del mayorista" disabled={confirmarEliminacion || procesandoLote} />
              <button type="button" className="btn sec chico" disabled={cantidadSeleccionada === 0 || procesandoLote || confirmarEliminacion} onClick={() => ejecutarSeleccion('proveedor')}>Asignar mayorista</button>
            </div>
            <button type="button" className="btn sec chico peligro-catalogo" disabled={cantidadSeleccionada === 0 || procesandoLote || confirmarEliminacion} onClick={() => ejecutarSeleccion('eliminar')}>
              {procesandoLote ? 'Procesando…' : `Eliminar${cantidadSeleccionada ? ` (${cantidadSeleccionada})` : ''}`}
            </button>
          </div>
        </div>
        </details>

        <dialog
          ref={confirmacionRef}
          className="confirmacion-eliminacion"
          aria-labelledby="confirmacion-eliminacion-titulo"
          aria-describedby="confirmacion-eliminacion-descripcion"
          onClose={() => setConfirmarEliminacion(false)}
          onClick={(e) => { if (e.target === confirmacionRef.current) confirmacionRef.current?.close() }}
        >
          <div className="confirmacion-eliminacion-tarjeta">
            <h2 id="confirmacion-eliminacion-titulo">¿Eliminar los ítems seleccionados?</h2>
            <p id="confirmacion-eliminacion-descripcion">
              Vas a eliminar {cantidadSeleccionada} ítem{cantidadSeleccionada === 1 ? '' : 's'} del catálogo. Los presupuestos ya emitidos no cambian. Esta acción no se puede deshacer.
            </p>
            <div className="confirmacion-eliminacion-acciones">
              <button type="button" className="btn sec chico" disabled={procesandoLote} onClick={() => confirmacionRef.current?.close()}>Cancelar</button>
              <button type="button" className="btn chico confirmar-borrado" disabled={procesandoLote} onClick={() => ejecutarSeleccion('eliminar')}>
                {procesandoLote ? 'Eliminando…' : 'Eliminar seleccionados'}
              </button>
            </div>
          </div>
        </dialog>

        {cargandoItems && <p className="sub" role="status">Cargando página de hasta {ITEMS_CATALOGO_POR_PAGINA} ítems…</p>}
        {!cargandoItems && secciones.length === 0 ? (
          <div className="tabla-caja"><p className="vacio">{totalItems === 0 && !busqueda && !proveedor && !soloSinProveedor && !verInactivos ? 'Todavía no cargaste ítems. Empezá con el primero.' : 'No hay ítems que coincidan.'}</p></div>
        ) : secciones.map(([nombreProveedor, productos]) => (
        <details className="seccion-proveedor catalogo-desplegable" key={nombreProveedor}>
          <summary className="catalogo-desplegable-resumen">
            <span className="seccion-proveedor-titulo"><span className="etiqueta-mayorista">Mayorista</span><strong>{nombreProveedor}</strong></span>
            <small>{productos.length} ítem{productos.length === 1 ? '' : 's'} en esta página</small>
            <span className="catalogo-desplegable-icono" aria-hidden="true" />
          </summary>
          <div className="tabla-caja">
          <table className="tabla tabla-catalogo">
            <thead><tr><th>Ítem</th><th>Proveedor / mayorista</th><th>Unidad</th><th className="num">Precio</th><th>Estado</th><th><span className="sr">Acciones</span></th></tr></thead>
            <tbody>
              {productos.map((i) => (
                <tr key={i.id} className={`${i.activo ? '' : 'apagado'}${seleccionados.has(i.id) ? ' seleccionado' : ''}`}>
                  <td className="catalogo-nombre">
                    <label className="seleccionar-item"><input type="checkbox" checked={seleccionados.has(i.id)} disabled={confirmarEliminacion || procesandoLote} onChange={(e) => cambiarSeleccion(i, e.target.checked)} aria-label={`Seleccionar ${i.nombre}`} /><span className="sr">Seleccionar</span></label>
                    <span className="catalogo-identidad"><strong>{i.nombre}</strong>{i.descripcion && <small>{i.descripcion}</small>}</span>
                  </td>
                  <td className="catalogo-proveedor" data-label="Proveedor / mayorista">{i.proveedor?.trim() || <span className="sin-dato">Sin asignar</span>}</td>
                  <td className="catalogo-unidad" data-label="Unidad">{i.unidad || '—'}</td>
                  <td className="catalogo-precio num" data-label="Precio">{importeEnMoneda(i.precio, i.moneda)}</td>
                  <td className="catalogo-estado" data-label="Estado"><span className={`pill ${i.activo ? 'on' : 'off'}`}>{i.activo ? 'Activo' : 'Desactivado'}</span></td>
                  <td className="catalogo-acciones-fila">
                    <button className="link" onClick={() => setEditando(i)}>Editar</button>
                    <details className="catalogo-menu-fila">
                      <summary>Más</summary>
                      <div>
                        <button className="link" onClick={() => alternar(i)}>{i.activo ? 'Desactivar' : 'Activar'}</button>
                        <button className="link peligro" onClick={() => eliminar(i)}>Eliminar</button>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </details>
        ))}
        {totalItems > 0 && <div className="paginacion-catalogo catalogo-paginacion">
          <span>{paginaItems * ITEMS_CATALOGO_POR_PAGINA + 1}–{Math.min((paginaItems + 1) * ITEMS_CATALOGO_POR_PAGINA, totalItems)} de {totalItems} ítems</span>
          <button type="button" className="btn sec chico" disabled={cargandoItems || paginaItems === 0} onClick={() => setPaginaItems((pagina) => Math.max(0, pagina - 1))}>Anterior</button>
          <button type="button" className="btn sec chico" disabled={cargandoItems || paginaItems >= totalPaginasItems - 1} onClick={() => setPaginaItems((pagina) => Math.min(totalPaginasItems - 1, pagina + 1))}>Siguiente</button>
        </div>}
      </main>

      {editando && (
        <FormItem
          item={editando === 'nuevo' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => { setEditando(null); cargar() }}
        />
      )}
    </Layout>
  )
}

function FormItem({ item, alCerrar, alGuardar }: { item: Item | null; alCerrar: () => void; alGuardar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [nombre, setNombre] = useState(item?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? '')
  const [proveedor, setProveedor] = useState(item?.proveedor ?? '')
  const [unidad, setUnidad] = useState(item?.unidad ?? 'unidad')
  const [precio, setPrecio] = useState(item ? formatearImporte(item.precio) : '')
  const [moneda, setMoneda] = useState(normalizarMoneda(item?.moneda))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { ref.current?.showModal() }, [])

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    const valor = parseImporte(precio)
    if (!nombre.trim()) return setError('Poné un nombre para el ítem.')
    if (!Number.isFinite(valor) || valor < 0) return setError('El precio tiene que ser un número igual o mayor a 0.')
    setError(''); setGuardando(true)
    try {
      const datos = { nombre: nombre.trim(), descripcion: descripcion.trim(), proveedor: proveedor.trim(), unidad: unidad.trim(), precio: valor, moneda }
      if (item) await repositorio.items.actualizar(item.id, datos)
      else await repositorio.items.crear({ ...datos, activo: true })
      alGuardar()
    } catch (e) { setError(mensajeError(e, 'No se pudo guardar el ítem.')); setGuardando(false) }
  }

  return (
    <dialog ref={ref} onClose={alCerrar} onClick={(e) => { if (e.target === ref.current) ref.current?.close() }}>
      <form onSubmit={enviar} className="form">
        <h2>{item ? 'Editar ítem' : 'Nuevo ítem'}</h2>
        <label className="campo">Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={160} />
        </label>
        <label className="campo">Descripción <small>(opcional)</small>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} />
        </label>
        <label className="campo">Proveedor / mayorista <small>(uso interno)</small>
          <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} maxLength={160} />
        </label>
        <div className="dos">
          <label className="campo">Precio
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="Ej.: 150.000"
              onBlur={() => { const n = parseImporte(precio); if (Number.isFinite(n)) setPrecio(formatearImporte(n)) }} />
          </label>
          <label className="campo">Moneda
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              {['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU', 'PYG', 'BOB', 'COP', 'MXN', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY'].map((codigo) => <option key={codigo} value={codigo}>{codigo}</option>)}
            </select>
          </label>
          <label className="campo">Unidad
            <input value={unidad} onChange={(e) => setUnidad(e.target.value)} list="unidades" maxLength={30} />
            <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button type="button" className="btn sec chico" onClick={() => ref.current?.close()}>Cancelar</button>
          <button className="btn chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </dialog>
  )
}
