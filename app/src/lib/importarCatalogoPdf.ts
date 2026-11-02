import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseImporte } from './formato'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export interface MaterialPdf {
  nombre: string
  cantidad: number | null
  precio: number
  moneda: string
}

export interface ProgresoLecturaPdf {
  pagina: number
  paginas: number
}

interface TextoPdf {
  str: string
  x: number
  y: number
}

function filasDePagina(items: unknown[]): TextoPdf[][] {
  const textos: TextoPdf[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('str' in item) || !('transform' in item)) continue
    const texto = item as { str: unknown; transform: unknown }
    if (typeof texto.str !== 'string' || !Array.isArray(texto.transform)) continue
    const x = texto.transform[4], y = texto.transform[5]
    if (typeof x === 'number' && typeof y === 'number' && texto.str.trim()) textos.push({ str: texto.str, x, y })
  }

  textos.sort((a, b) => b.y - a.y || a.x - b.x)
  const filas = new Map<number, TextoPdf[]>()
  for (const texto of textos) {
    const clave = Math.round(texto.y / 2.5)
    const fila = filas.get(clave) ?? []
    fila.push(texto)
    filas.set(clave, fila)
  }
  return [...filas.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, fila]) => fila.sort((a, b) => a.x - b.x))
}

interface Columnas {
  descripcion?: number
  cantidad?: number
  precio?: number
  importe?: number
  moneda?: string
}

interface ColumnasTabla {
  codigo: number
  descripcion: number
  modelo: number
  precio: number
  moneda?: string
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const textoFila = (fila: TextoPdf[]) => fila.map((t) => t.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
const NUMERO = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)`
const MESES = /\b(?:ENE(?:RO)?|FEB(?:RERO)?|MAR(?:ZO)?|ABR(?:IL)?|MAY(?:O)?|JUN(?:IO)?|JUL(?:IO)?|AGO(?:STO)?|SEP(?:TIEMBRE)?|OCT(?:UBRE)?|NOV(?:IEMBRE)?|DIC(?:IEMBRE)?)\b/

function esFechaOEncabezado(texto: string): boolean {
  const n = normalizar(texto)
  return /\b(?:19|20)\d{2}\b/.test(n) && MESES.test(n) ||
    /\b\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})\b/.test(n) ||
    /^\s*\d{1,2}[/-]\d{4}\s*$/.test(n)
}

function leerNumero(texto: string): number {
  const compacto = texto
    .replace(/U\$S|US\$|USD|ARS|AR\$|EUR|GBP|BRL|CAD|AUD|CLP|UYU|PYG|BOB|COP|MXN|CHF|JPY|CNY|R\$|€|£|¥/gi, '')
    .replace(/\s*([,.])\s*/g, '$1')
    .replace(/[^\d.,]/g, '')
  if (!/^\d+(?:[.,]\d+)*$/.test(compacto)) return NaN

  const ultimoSeparador = Math.max(compacto.lastIndexOf('.'), compacto.lastIndexOf(','))
  if (ultimoSeparador < 0) return Number(compacto)

  const parteFinal = compacto.length - ultimoSeparador - 1
  const esMiles = parteFinal === 3 && /^\d{1,3}(?:[.,]\d{3})+$/.test(compacto)
  if (esMiles) return Number(compacto.replace(/[.,]/g, ''))
  if (parteFinal === 1 || parteFinal === 2) {
    const entero = compacto.slice(0, ultimoSeparador)
    if (!/^\d+(?:[.,]\d{3})*$/.test(entero)) return NaN
    return Number(entero.replace(/[.,]/g, '') + '.' + compacto.slice(ultimoSeparador + 1))
  }
  return NaN
}

function monedaExplicita(texto: string): string | undefined {
  const normalizado = normalizar(texto)
  if (/U\$S|US\$|\bUSD\b|\bU\.S\.D\b|\bUS\b|\bDOLARES?\b|\bDOLLARS?\b/.test(normalizado)) return 'USD'
  if (/\b(?:ARS|AR\$|PESOS?)\b/.test(normalizado)) return 'ARS'
  if (/\bEUR\b|\bEUROS?\b|€/.test(normalizado)) return 'EUR'
  if (/\bGBP\b|\bLIBRAS?\b|£/.test(normalizado)) return 'GBP'
  if (/\bBRL\b|\bREAIS?\b|R\$/.test(normalizado)) return 'BRL'
  for (const codigo of ['CAD', 'AUD', 'CLP', 'UYU', 'PYG', 'BOB', 'COP', 'MXN', 'CHF', 'JPY', 'CNY']) {
    if (new RegExp(`\\b${codigo}\\b`).test(normalizado)) return codigo
  }
  if (/\bFRANCOS?\b/.test(normalizado)) return 'CHF'
  if (/\bYENES?\b|¥/.test(normalizado)) return 'JPY'
  if (/\bYUANES?\b/.test(normalizado)) return 'CNY'
  return undefined
}

const leerMoneda = (texto: string, predeterminada = 'ARS') => monedaExplicita(texto) ?? predeterminada

function columnaDe(fila: TextoPdf[], patron: RegExp): number | undefined {
  const celda = fila.find((t) => patron.test(normalizar(t.str)))
  return celda?.x
}

function detectarColumnas(filas: TextoPdf[][]): Columnas | null {
  for (const fila of filas) {
    const texto = normalizar(textoFila(fila))
    const descripcion = columnaDe(fila, /\b(?:DESCRIPCION|PRODUCTO|MATERIAL|ARTICULO|DETALLE)\b/)
    const cantidad = columnaDe(fila, /\b(?:CANT(?:IDAD(?:ES)?)?|QTY|UNIDAD(?:ES)?|UNID\.?)\b/)
    const precio = columnaDe(fila, /\b(?:P\.?\s*UNIT(?:ARIO)?|PRECIO(?:\s*UNITARIO)?|UNITARIO)\b/)
    const importe = columnaDe(fila, /\b(?:IMPORTE|SUBTOTAL|TOTAL)\b/)
    if (descripcion !== undefined && (precio !== undefined || importe !== undefined)) return { descripcion, cantidad, precio, importe, moneda: monedaExplicita(textoFila(fila)) }
    if (/^(?:COD(?:IGO)?|ID|SKU|REFERENCIA)\b/.test(texto) && (precio !== undefined || importe !== undefined)) {
      return { descripcion, cantidad, precio, importe, moneda: monedaExplicita(textoFila(fila)) }
    }
  }
  return null
}

function detectarTablas(filas: TextoPdf[][]): ColumnasTabla[] {
  const tablas = new Map<string, ColumnasTabla>()
  for (const fila of filas) {
    const codigos = fila.filter((t) => normalizar(t.str) === 'CODIGO')
    for (const codigo of codigos) {
      const siguienteCodigo = codigos
        .filter((t) => t.x > codigo.x)
        .sort((a, b) => a.x - b.x)[0]?.x ?? Infinity
      const entreColumnas = fila.filter((t) => t.x > codigo.x && t.x < siguienteCodigo)
      const descripcion = entreColumnas.find((t) => normalizar(t.str) === 'DESCRIPCION')
      const modelo = entreColumnas.find((t) => normalizar(t.str) === 'MOD' || normalizar(t.str) === 'MODELO')
      const precio = entreColumnas.find((t) => /^PRECIO\b/.test(normalizar(t.str)))
      if (!descripcion || !precio) continue
      const tabla = {
        codigo: codigo.x,
        descripcion: descripcion.x,
        modelo: modelo?.x ?? precio.x,
        precio: precio.x,
        moneda: monedaExplicita(textoFila(fila)),
      }
      const clave = [tabla.codigo, tabla.descripcion, tabla.modelo, tabla.precio].map((x) => Math.round(x)).join(':')
      tablas.set(clave, tabla)
    }
  }
  return [...tablas.values()]
}

function leerMaterialesDeTabla(items: TextoPdf[], tablas: ColumnasTabla[]): MaterialPdf[] {
  const codigos = items.filter((item) => /^\d{4,12}$/.test(item.str)).sort((a, b) => b.y - a.y)
  const tablaPorCodigo = new Map<TextoPdf, ColumnasTabla>()
  const codigosPorTabla = new Map<ColumnasTabla, TextoPdf[]>()
  for (const codigo of codigos) {
    const tabla = tablas.reduce<ColumnasTabla | null>((cercana, actual) =>
      cercana === null || Math.abs(actual.codigo - codigo.x) < Math.abs(cercana.codigo - codigo.x) ? actual : cercana, null)
    if (!tabla || Math.abs(tabla.codigo - codigo.x) > 50) continue
    tablaPorCodigo.set(codigo, tabla)
    const deTabla = codigosPorTabla.get(tabla)
    if (deTabla) deTabla.push(codigo)
    else codigosPorTabla.set(tabla, [codigo])
  }
  const materiales: MaterialPdf[] = []
  for (const codigo of codigos) {
    const tabla = tablaPorCodigo.get(codigo)
    if (!tabla) continue
    const codigosMismaTabla = codigosPorTabla.get(tabla) ?? []
    const indiceCodigo = codigosMismaTabla.indexOf(codigo)
    const anterior = codigosMismaTabla[indiceCodigo - 1]
    const siguiente = codigosMismaTabla[indiceCodigo + 1]
    const limiteSuperior = anterior ? (anterior.y + codigo.y) / 2 : codigo.y + 9
    const limiteInferior = siguiente ? (siguiente.y + codigo.y) / 2 : codigo.y - 9

    const textosPrecio = items
      .filter((item) => item.x >= tabla.precio - 15 && item.x <= tabla.precio + 35 && Math.abs(item.y - codigo.y) <= 1.5)
      .sort((a, b) => a.x - b.x)
    const textoPrecio = textosPrecio.map((item) => item.str).join(' ')
    const precio = leerNumero(textoPrecio)
    if (!Number.isFinite(precio) || precio < 0) continue
    const monedaCercana = items
      .filter((item) => Math.abs(item.y - codigo.y) <= 1.5 && item.x >= tabla.precio - 60 && item.x <= tabla.precio + 35)
      .sort((a, b) => Math.abs(a.x - tabla.precio) - Math.abs(b.x - tabla.precio))
      .map((item) => monedaExplicita(item.str))
      .find((moneda): moneda is string => moneda !== undefined)

    const descripcion = items
      .filter((item) =>
        item.x > codigo.x + 15 &&
        item.x < tabla.modelo - 15 &&
        item.y <= limiteSuperior &&
        item.y >= limiteInferior &&
        !/^\d+(?:[.,]\d+)?$/.test(item.str) &&
        !/(?:U\$S|\$|ARS)/i.test(item.str))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((item) => item.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const nombre = limpiarNombre(descripcion)
    if (nombrePareceMaterial(nombre)) materiales.push({ nombre, cantidad: null, precio, moneda: monedaCercana ?? leerMoneda(textoPrecio, tabla.moneda) })
  }
  return materiales
}

function celdaEnColumna(fila: TextoPdf[], x: number | undefined, columnas: Columnas): string {
  if (x === undefined) return ''
  const anclas = [
    columnas.descripcion !== undefined ? { x: columnas.descripcion, tipo: 'descripcion' } : null,
    columnas.cantidad !== undefined ? { x: columnas.cantidad, tipo: 'cantidad' } : null,
    columnas.precio !== undefined ? { x: columnas.precio, tipo: 'precio' } : null,
    columnas.importe !== undefined ? { x: columnas.importe, tipo: 'importe' } : null,
  ].filter((a): a is { x: number; tipo: string } => a !== null).sort((a, b) => a.x - b.x)
  const indice = anclas.findIndex((a) => a.tipo === (
    x === columnas.descripcion ? 'descripcion' :
    x === columnas.cantidad ? 'cantidad' :
    x === columnas.precio ? 'precio' : 'importe'
  ))
  const actual = anclas[indice]
  if (!actual) return ''
  const anterior = indice > 0 ? (anclas[indice - 1].x + actual.x) / 2 : -Infinity
  const siguiente = indice < anclas.length - 1 ? (actual.x + anclas[indice + 1].x) / 2 : Infinity
  return fila.filter((t) => t.x >= anterior && t.x < siguiente).map((t) => t.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

function limpiarNombre(texto: string): string {
  let nombre = texto
    .replace(/(^|[^\d])\d+(?:\.\d{3})*,\d{1,2}(?=$|[^\d])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
  for (let i = 0; i < 4; i++) {
    const limpio = nombre
      .replace(/^(?:(?:COD(?:IGO)?|ID|SKU|REF(?:ERENCIA)?)\s*[:#-]?\s*)?(?:[A-Z]{1,4}[-/]?)?\d{2,}(?:[-./]\d+)*\s+/i, '')
      .replace(/^(?:NRO?\.?\s*)?#?\d{2,}\s+/i, '')
      .trim()
    if (limpio === nombre) break
    nombre = limpio
  }
  return nombre.replace(/^[\s:|–—-]+|[\s:|–—-]+$/g, '').trim()
}

function nombrePareceMaterial(nombre: string): boolean {
  const normalizado = normalizar(nombre)
  if (normalizado.length < 3 || !/[A-ZÁÉÍÓÚÑ]/.test(normalizado)) return false
  if (MESES.test(normalizado) || /\b(?:PAG(?:INA)?|FECHA|CODIGO|DESCRIPCION|CANTIDAD|PRECIO|TOTAL|SUBTOTAL|IVA)\b/.test(normalizado)) return false
  if (/^\d/.test(normalizado) || /^(?=.*\d)[A-Z0-9-]+$/.test(normalizado)) return false
  return true
}

function leerMaterial(fila: TextoPdf[], columnas: Columnas | null): MaterialPdf | null {
  const todo = textoFila(fila)
  if (!todo || esFechaOEncabezado(todo) || /\b(?:PAG(?:INA)?|PAGE)\b/i.test(todo)) return null

  if (columnas?.descripcion !== undefined) {
    const descripcion = celdaEnColumna(fila, columnas.descripcion, columnas)
    const precioTexto = celdaEnColumna(fila, columnas.precio ?? columnas.importe, columnas)
    const cantidadTexto = celdaEnColumna(fila, columnas.cantidad, columnas)
    const precio = leerNumero(precioTexto)
    if (descripcion && Number.isFinite(precio)) {
      const nombre = limpiarNombre(descripcion)
      const cantidadLeida = leerNumero(cantidadTexto)
      const cantidad = Number.isFinite(cantidadLeida) ? cantidadLeida : null
      if (nombrePareceMaterial(nombre) && (cantidad === null || cantidad > 0)) return { nombre, cantidad, precio, moneda: leerMoneda(precioTexto, monedaExplicita(todo) ?? columnas.moneda) }
    }
    if (columnas.precio !== undefined || columnas.importe !== undefined) return null
  }

  const coincidencia = todo.match(new RegExp(String.raw`^(.*?)\s+((?:U\$S|US\$|USD|ARS|AR\$|R\$|EUR|GBP|€|£|\$)?\s*${NUMERO})\s*$`, 'i'))
  if (!coincidencia) return null

  const antesDePrecio = coincidencia[1].replace(/\s+(?:\$\s*|ARS\s*)?$/, '').trim()
  const cantidadMatch = antesDePrecio.match(new RegExp(String.raw`^(.*?)\s*[x×]\s*(${NUMERO})\s*$`, 'i'))
  const textoNombre = cantidadMatch ? cantidadMatch[1] : antesDePrecio
  const nombre = limpiarNombre(textoNombre)
  const precio = leerNumero(coincidencia[2])
  const cantidad = cantidadMatch ? parseImporte(cantidadMatch[2]) : null
  if (!nombrePareceMaterial(nombre) || !Number.isFinite(precio) || precio < 0 || (cantidad !== null && (!Number.isFinite(cantidad) || cantidad <= 0))) return null
  return { nombre, cantidad, precio, moneda: leerMoneda(coincidencia[2]) }
}

/** Lee texto seleccionable y detecta filas que terminan en un precio en formato argentino. */
export async function leerMaterialesPdf(
  archivo: File,
  alProgresar?: (progreso: ProgresoLecturaPdf) => void,
): Promise<MaterialPdf[]> {
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) })
  try {
    const documento = await tarea.promise
    alProgresar?.({ pagina: 0, paginas: documento.numPages })
    const materiales: MaterialPdf[] = []
    const paginasPorLote = 4
    let columnas: Columnas | null = null
    let tablasDocumento: ColumnasTabla[] = []
    for (let inicio = 1; inicio <= documento.numPages; inicio += paginasPorLote) {
      const fin = Math.min(inicio + paginasPorLote - 1, documento.numPages)
      const resultados = await Promise.all(Array.from({ length: fin - inicio + 1 }, async (_, indice) => {
        const pagina = await documento.getPage(inicio + indice)
        const contenido = await pagina.getTextContent()
        const items: TextoPdf[] = []
        for (const item of contenido.items) {
          if (typeof item !== 'object' || item === null || !('str' in item) || !('transform' in item)) continue
          const texto = item as { str: unknown; transform: unknown }
          if (typeof texto.str !== 'string' || !Array.isArray(texto.transform)) continue
          const x = texto.transform[4], y = texto.transform[5]
          if (typeof x === 'number' && typeof y === 'number' && texto.str.trim()) items.push({ str: texto.str, x, y })
        }
        return { items, filas: filasDePagina(contenido.items) }
      }))
      for (const { items, filas } of resultados) {
        const tablasPagina = detectarTablas(filas)
        if (tablasPagina.length > 0) tablasDocumento = tablasPagina
        if (tablasDocumento.length > 0) {
          materiales.push(...leerMaterialesDeTabla(items, tablasPagina.length > 0 ? tablasPagina : tablasDocumento))
          continue
        }
        const columnasPagina: Columnas | null = detectarColumnas(filas) ?? columnas
        if (!columnas) columnas = columnasPagina
        for (const fila of filas) {
          const material = leerMaterial(fila, columnasPagina)
          if (material) materiales.push(material)
        }
      }
      alProgresar?.({ pagina: fin, paginas: documento.numPages })
    }
    return materiales
  } finally {
    await tarea.destroy()
  }
}
