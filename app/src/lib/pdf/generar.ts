import { createElement } from 'react'
import { repositorio } from '../repositorio'
import type { Empresa, Presupuesto } from '../tipos'
import type { Fuentes, LogoPng } from './PresupuestoPdf'

/**
 * Convierte el logo de la empresa (SVG, WebP, PNG o JPG) a PNG, el formato que acepta el PDF.
 * Devuelve undefined si no hay logo o no se pudo leer: el PDF usa la inicial de la empresa.
 */
export async function logoComoPng(empresa: Empresa): Promise<LogoPng | undefined> {
  const url = repositorio.empresa.archivoUrl(empresa, empresa.logo)
  if (!url) return undefined
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const ancho = img.naturalWidth || 300, alto = img.naturalHeight || 100
    const k = Math.min(1, 600 / ancho)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(ancho * k * 2); canvas.height = Math.round(alto * k * 2)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { src: canvas.toDataURL('image/png'), ancho: canvas.width, alto: canvas.height }
  } catch { return undefined }
}

const POPPINS: Fuentes = { titulos: 'Poppins', texto: 'Poppins' }

/** Registra Poppins (incluida en la app) y, si la empresa subió archivos de fuente, esas tipografías. */
async function registrarFuentes(empresa: Empresa, usarPropias: boolean): Promise<Fuentes> {
  const { Font } = await import('@react-pdf/renderer')
  Font.register({
    family: 'Poppins',
    fonts: [
      { src: '/fonts/Poppins-Regular.ttf', fontWeight: 400 },
      { src: '/fonts/Poppins-Medium.ttf', fontWeight: 500 },
      { src: '/fonts/Poppins-Bold.ttf', fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((palabra) => [palabra])
  if (!usarPropias) return POPPINS

  const fuentes = { ...POPPINS }
  const propia = (familia: string, archivo?: string) => {
    const src = repositorio.empresa.archivoUrl(empresa, archivo)
    if (!src) return undefined
    Font.register({ family: familia, fonts: [{ src, fontWeight: 400 }, { src, fontWeight: 700 }] })
    return familia
  }
  fuentes.titulos = propia('EmpresaTitulos', empresa.fuenteTitulosArchivo) ?? fuentes.titulos
  fuentes.texto = propia('EmpresaTexto', empresa.fuenteTextoArchivo) ?? propia('EmpresaTitulos', empresa.fuenteTitulosArchivo) ?? fuentes.texto
  return fuentes
}

/** Genera el PDF A4 del presupuesto con la plantilla (logo, colores y tipografías) de la empresa. */
export async function generarPdf(presupuesto: Presupuesto, empresa: Empresa): Promise<Blob> {
  const [{ pdf }, { PresupuestoPdf }] = await Promise.all([import('@react-pdf/renderer'), import('./PresupuestoPdf')])
  const logo = await logoComoPng(empresa)
  const intentar = async (propias: boolean) => {
    const fuentes = await registrarFuentes(empresa, propias)
    return pdf(createElement(PresupuestoPdf, { presupuesto, empresa, logo, fuentes }) as unknown as Parameters<typeof pdf>[0]).toBlob()
  }
  try { return await intentar(true) } catch { return intentar(false) } // si una fuente propia falla, se usa Poppins
}

export const nombreArchivo = (p: Presupuesto) => {
  const cliente = (p.clienteDatos?.nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `Presupuesto-${String(p.numero).padStart(4, '0')}${cliente ? '-' + cliente : ''}.pdf`
}
