import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseImporte } from './formato'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export interface MaterialPdf {
  nombre: string
  cantidad: number | null
  precio: number
  moneda: string
  /** Página del PDF donde apareció (sirve para detectar encabezados y pies que se repiten). */
  pagina?: number
  /** Si la fila podría no ser un producto, el motivo: llega desmarcada para que la persona decida. */
  dudoso?: string
}

/** Resultado de leer el PDF: los ítems y cuántas filas se ignoraron por no parecer productos. */
export interface LecturaPdf {
  materiales: MaterialPdf[]
  ignorados: { motivo: string; cantidad: number }[]
}

export interface ProgresoLecturaPdf {
  pagina: number
  paginas: number
}

interface TextoPdf {
  str: string
  x: number
  y: number
  /** Tamaño aproximado de la letra (alto del glifo en puntos). */
  alto?: number
  /** Ancho del texto en puntos. */
  ancho?: number
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

function limpiarNombre(texto: string, quitarImportes = true): string {
  // Solo se quitan importes de verdad (con miles o de 3 cifras o más); las medidas como
  // «2,5 mm» o «1,50 m» son parte del nombre.
  let nombre = (quitarImportes ? texto.replace(/(^|[^\d])(?:\d{1,3}(?:\.\d{3})+|\d{3,}),\d{1,2}(?!\d)(?!\s*(?:mm|cm|mts?|m|kg|grs?|g|w|kw|v|a|amp|lts?|l|ml|cc|hp|pulg|"|”)\b)/gi, '$1 ') : texto)
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

const SOLO_MONEDA = /^(?:U\$S|US\$|U\$D|USD|ARS|AR\$|R\$|EUR|GBP|BRL|\$|€|£)$/i
const RUIDO_TARJETA = /\b(?:PRECIO(?:S)?(?:\s+DE)?(?:\s+LISTA)?|LISTA|IVA|INCLUIDO|FINAL|CONTADO|OFERTA|PROMO(?:CION)?|STOCK|UNIDAD(?:ES)?|COD(?:IGO)?|SKU|ART(?:ICULO)?\.?|REF(?:ERENCIA)?|CUOTAS?|SIN\s+INTERES)\b/

interface PrecioTarjeta {
  x: number
  y: number
  precio: number
  moneda: string
  partes: Set<TextoPdf>
}

/** Busca importes con moneda (en el mismo texto o en uno vecino de la misma línea). */
function preciosDeTarjetas(items: TextoPdf[]): PrecioTarjeta[] {
  const precios: PrecioTarjeta[] = []
  for (const item of items) {
    const texto = item.str.trim()
    if (SOLO_MONEDA.test(texto) || esFechaOEncabezado(texto) || /%/.test(texto)) continue
    const numero = leerNumero(texto)
    if (!Number.isFinite(numero) || numero <= 0) continue
    const vecinos = items
      // Moneda y precio suelen ir con letras de distinto tamaño: la tolerancia vertical depende del tamaño.
      .filter((otro) => otro !== item && SOLO_MONEDA.test(otro.str.trim()) &&
        Math.abs(otro.y - item.y) <= Math.max(2.5, 0.6 * Math.max(otro.alto ?? 0, item.alto ?? 0)))
      .filter((otro) => {
        const fin = otro.x + (otro.ancho ?? otro.str.length * (otro.alto ?? 8) * 0.55)
        const finItem = item.x + (item.ancho ?? texto.length * (item.alto ?? 8) * 0.55)
        return (otro.x <= item.x && item.x - fin <= 24) || (otro.x >= finItem - 2 && otro.x - finItem <= 24)
      })
      .sort((a, b) => Math.abs(a.x - item.x) - Math.abs(b.x - item.x))
    const marca = /(?:U\$S|US\$|U\$D|USD|ARS|AR\$|R\$|EUR|GBP|\$|€|£)/i.test(texto) ? texto : vecinos[0]?.str ?? ''
    const formatoPrecio = /^\$?\s*\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$|^\$?\s*\d+,\d{2}$/.test(texto.replace(/^(?:U\$S|US\$|USD|ARS)\s*/i, ''))
    if (!marca && !formatoPrecio) continue
    const partes = new Set<TextoPdf>([item])
    if (vecinos[0] && !/(?:U\$S|US\$|USD|ARS|\$|€|£)/i.test(texto)) partes.add(vecinos[0])
    const x = Math.min(...[...partes].map((p) => p.x))
    precios.push({ x, y: item.y, precio: numero, moneda: leerMoneda(marca || texto), partes })
  }
  return precios
}

/**
 * Catálogos armados como tarjetas o recuadros: cada producto tiene su nombre y, debajo
 * o al lado, la moneda y el precio. Se toma como nombre el texto más destacado de la
 * tarjeta (la letra más grande) entre el precio y la tarjeta anterior de la misma columna.
 */
function leerMaterialesDeTarjetas(items: TextoPdf[]): MaterialPdf[] {
  const precios = preciosDeTarjetas(items)
  if (precios.length === 0) return []
  const usados = new Set<TextoPdf>(precios.flatMap((p) => [...p.partes]))
  const materiales: MaterialPdf[] = []
  const vistos = new Set<string>()

  for (const precio of precios) {
    const mismaFila = precios.filter((otro) => otro !== precio && Math.abs(otro.y - precio.y) <= 30)
    const distancia = Math.min(...mismaFila.map((otro) => Math.abs(otro.x - precio.x)).filter((d) => d > 20), Infinity)
    const anchoTarjeta = Number.isFinite(distancia) ? distancia : 240
    const izquierda = precio.x - anchoTarjeta * 0.45
    const derecha = precio.x + anchoTarjeta * 0.8
    const deColumna = (x: number) => x >= izquierda && x < derecha
    const techo = precios
      .filter((otro) => otro !== precio && otro.y > precio.y + 6 && deColumna(otro.x))
      .reduce((menor, otro) => Math.min(menor, otro.y), precio.y + 180)

    const candidatos = items.filter((item) =>
      !usados.has(item) &&
      deColumna(item.x) &&
      item.y < techo - 2 &&
      (item.y > precio.y + 2 || (Math.abs(item.y - precio.y) <= 2 && item.x < precio.x)))
      .filter((item) => {
        const t = item.str.trim()
        const n = normalizar(t)
        return t.length > 1 && !SOLO_MONEDA.test(t) && !/^[\d\s.,:$%-]+$/.test(t) && !esFechaOEncabezado(t) &&
          !(RUIDO_TARJETA.test(n) && n.split(' ').length <= 3)
      })
    if (candidatos.length === 0) continue
    // Solo el bloque de texto pegado al precio: un salto grande (imagen, borde de la tarjeta,
    // título de la página) marca el final de la tarjeta.
    candidatos.sort((a, b) => a.y - b.y)
    let ultimoY = precio.y
    const bloque: TextoPdf[] = []
    for (const c of candidatos) {
      const salto = Math.max(28, 2.6 * (c.alto ?? 10))
      if (c.y - ultimoY > salto) break
      bloque.push(c)
      ultimoY = Math.max(ultimoY, c.y)
    }
    if (bloque.length === 0) continue
    candidatos.splice(0, candidatos.length, ...bloque)

    const mayor = Math.max(...candidatos.map((c) => c.alto ?? 0))
    const destacados = mayor > 0 ? candidatos.filter((c) => (c.alto ?? 0) >= mayor - 0.6) : candidatos
    // Si todo tiene el mismo tamaño, el nombre suele ser lo más cercano al precio.
    const elegidos = destacados.length === candidatos.length
      ? candidatos.sort((a, b) => a.y - b.y).slice(0, 3)
      : destacados
    // En una tarjeta el precio está aparte: los números con coma del nombre son medidas (2,5 mm).
    const nombre = limpiarNombre(elegidos
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((c) => c.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 200), false)
    if (!nombrePareceMaterial(nombre)) continue
    const clave = `${normalizar(nombre)}|${precio.precio}|${precio.moneda}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    materiales.push({ nombre, cantidad: null, precio: precio.precio, moneda: precio.moneda })
  }
  return materiales
}

// ───────── ¿Es de verdad un producto? ─────────
// La lectura toma cualquier línea o tarjeta que termine en un número con forma de precio.
// En una lista real también aparecen datos de contacto, condiciones comerciales, encabezados
// y totales: lo seguro se ignora y lo dudoso llega desmarcado con el motivo.

const RUIDO_SEGURO: { motivo: string; patron: RegExp }[] = [
  { motivo: 'datos de contacto', patron: /@|\bWWW\.|HTTPS?:|\.COM\b|\.COM\.AR\b|\b(?:TEL(?:EFONO|EFONOS)?|TELS?|CEL(?:ULAR)?|WHATS ?APP|WSP|FAX|E-?MAIL|CORREO|INSTAGRAM|FACEBOOK)\b/ },
  { motivo: 'datos fiscales o de la empresa', patron: /\b(?:CUIT|CUIL|IIBB|INGRESOS BRUTOS|RESPONSABLE INSCRIPTO|MONOTRIBUT\w*|RAZON SOCIAL|DOMICILIO|HORARIOS? DE ATENCION|ATENCION AL CLIENTE|SUCURSAL(?:ES)?)\b/ },
  { motivo: 'condiciones comerciales', patron: /\b(?:SUJETOS? A|SIN PREVIO AVISO|VIGENCIA|VIGENTES? (?:DESDE|HASTA|AL)|VALIDOS? (?:DESDE|HASTA|POR)|CONDICIONES|FORMAS? DE PAGO|ENVIOS?|FLETES?|BONIFICACION(?:ES)?|DESCUENTOS?|RECARGOS?|COMPRAS? (?:MAYORES|SUPERIORES|MINIMAS?|DESDE)|PEDIDOS? MINIMOS?|MONTO MINIMO|CONSULT(?:AR|E|ENOS)|NO INCLUYE|PRECIOS? (?:EXPRESADOS|SUJETOS|VALIDOS|VIGENTES)|COTIZACION|DOLAR (?:OFICIAL|BNA|BLUE|MEP)|TIPO DE CAMBIO|PAGO EN EFECTIVO|CUOTAS? SIN INTERES)\b/ },
  { motivo: 'totales o resúmenes', patron: /^(?:TOTAL(?:ES)?|SUB ?TOTAL|IVA|NETO|SALDO|RESUMEN|IMPORTE TOTAL)\b/ },
]


function motivoRuido(m: MaterialPdf): string | undefined {
  const n = normalizar(m.nombre)
  for (const { motivo, patron } of RUIDO_SEGURO) if (patron.test(n)) return motivo
  if (/:\s*$/.test(m.nombre.trim())) return 'títulos de sección'
  // Teléfonos, CUIT o códigos largos leídos como si fueran el precio.
  if (Number.isInteger(m.precio) && m.precio >= 100_000_000) return 'números que no son precios (teléfonos, CUIT o códigos)'
  return undefined
}

const mediana = (valores: number[]) => {
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
}

/** Separa lo que no es un producto y marca lo dudoso. */
export function clasificarMateriales(materiales: MaterialPdf[], paginas = 1): LecturaPdf {
  const ignorados = new Map<string, number>()
  const ignorar = (motivo: string) => ignorados.set(motivo, (ignorados.get(motivo) ?? 0) + 1)

  // Lo mismo, con el mismo precio, en 3 páginas o más es un encabezado o un pie de página.
  const paginasPorFila = new Map<string, Set<number>>()
  for (const m of materiales) {
    const clave = `${normalizar(m.nombre)}|${m.precio}`
    const conjunto = paginasPorFila.get(clave) ?? new Set<number>()
    conjunto.add(m.pagina ?? 0)
    paginasPorFila.set(clave, conjunto)
  }

  const quedan: MaterialPdf[] = []
  for (const m of materiales) {
    const motivo = motivoRuido(m)
    if (motivo) { ignorar(motivo); continue }
    // Encabezado o pie: misma fila en casi todas las páginas y sin pinta de producto
    // (un producto de verdad rara vez se repite igual en cada hoja de la lista).
    const repeticiones = paginasPorFila.get(`${normalizar(m.nombre)}|${m.precio}`)?.size ?? 0
    if (paginas >= 3 && repeticiones >= 3 && repeticiones >= paginas * 0.8 && /\b(?:PAG(?:INA)?|LISTA|PRECIOS|DISTRIBUIDORA|MAYORISTA|S\.?A\.?|S\.?R\.?L\.?|HOJA|CONTINUA|SIGUE)\b/.test(normalizar(m.nombre))) { ignorar('encabezados o pies que se repiten en cada página'); continue }
    if (/^(?:PAG(?:INA)?\.?\s*\d+|HOJA\s*\d+)\b/.test(normalizar(m.nombre))) { ignorar('números de página'); continue }
    quedan.push(m)
  }

  // Dudosos: llegan desmarcados con el motivo.
  const precios = quedan.map((m) => m.precio).filter((p) => p > 0)
  const referencia = precios.length >= 8 ? mediana(precios) : 0
  const resultado = quedan.map((m): MaterialPdf => {
    const palabras = m.nombre.trim().split(/\s+/).length
    let dudoso: string | undefined
    if (m.precio === 0) dudoso = 'El precio es 0.'
    else if (palabras > 16 || m.nombre.length > 130) dudoso = 'Parece una frase o una aclaración, no un producto.'
    else if (referencia > 0 && (m.precio > referencia * 150 || m.precio < referencia / 150)) dudoso = 'El precio es muy distinto al del resto de la lista.'
    else if (Number.isInteger(m.precio) && m.precio >= 1990 && m.precio <= 2040 && /\b(?:LISTA|PRECIOS?|CATALOGO|TEMPORADA|EDICION|ACTUALIZAD[AO])\b/.test(normalizar(m.nombre))) dudoso = 'El número parece un año, no un precio.'
    else if (/^[A-ZÁÉÍÓÚÑ\s]+$/.test(m.nombre.trim()) && palabras <= 3 && m.nombre.trim() === m.nombre.trim().toUpperCase() && /\b(?:LINEA|SERIE|FAMILIA|CATEGORIA|RUBRO|SECCION|LISTA|CATALOGO)\b/.test(normalizar(m.nombre))) dudoso = 'Parece el título de una sección.'
    return dudoso ? { ...m, dudoso } : m
  })

  return { materiales: resultado, ignorados: [...ignorados.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })) }
}

/** Lee texto seleccionable y detecta filas que terminan en un precio en formato argentino. */
export async function leerMaterialesPdf(
  archivo: File,
  alProgresar?: (progreso: ProgresoLecturaPdf) => void,
): Promise<LecturaPdf> {
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
          const texto = item as { str: unknown; transform: unknown; width?: unknown; height?: unknown }
          if (typeof texto.str !== 'string' || !Array.isArray(texto.transform)) continue
          const x = texto.transform[4], y = texto.transform[5]
          const escala = Math.hypot(Number(texto.transform[2]) || 0, Number(texto.transform[3]) || 0)
          const alto = typeof texto.height === 'number' && texto.height > 0 ? texto.height : escala
          const ancho = typeof texto.width === 'number' ? texto.width : undefined
          if (typeof x === 'number' && typeof y === 'number' && texto.str.trim()) items.push({ str: texto.str, x, y, alto, ancho })
        }
        return { items, filas: filasDePagina(contenido.items) }
      }))
      for (const [indice, { items, filas }] of resultados.entries()) {
        const numeroPagina = inicio + indice
        const desde = materiales.length
        const tablasPagina = detectarTablas(filas)
        if (tablasPagina.length > 0) tablasDocumento = tablasPagina
        if (tablasDocumento.length > 0) {
          materiales.push(...leerMaterialesDeTabla(items, tablasPagina.length > 0 ? tablasPagina : tablasDocumento))
          for (let i = desde; i < materiales.length; i++) materiales[i].pagina = numeroPagina
          continue
        }
        const columnasPagina: Columnas | null = detectarColumnas(filas) ?? columnas
        if (!columnas) columnas = columnasPagina
        const porFilas: MaterialPdf[] = []
        for (const fila of filas) {
          const material = leerMaterial(fila, columnasPagina)
          if (material) porFilas.push(material)
        }
        // Catálogos en tarjetas o recuadros (nombre arriba, moneda y precio abajo):
        // se usan si encuentran más productos que la lectura por filas.
        const porTarjetas = leerMaterialesDeTarjetas(items)
        materiales.push(...(porTarjetas.length > porFilas.length ? porTarjetas : porFilas))
        for (let i = desde; i < materiales.length; i++) materiales[i].pagina = numeroPagina
      }
      alProgresar?.({ pagina: fin, paginas: documento.numPages })
    }
    return clasificarMateriales(materiales, documento.numPages)
  } finally {
    await tarea.destroy()
  }
}
