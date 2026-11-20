/** Formas de pago para elegir en cada presupuesto. Además, el usuario puede escribir la que quiera. */
export const FORMAS_PAGO = [
  'A convenir',
  '50% al aceptar y 50% a la entrega',
  'Contra entrega',
  '100% por adelantado',
  'Transferencia a 30 días',
]
/** Valor del selector que habilita el campo de texto libre. */
export const OTRA_FORMA = '__otra__'

/** Palabras que indican que una parte se paga antes: «al aceptar», «de seña», «anticipo»… */
const MOMENTO = '(?:al\\s+aceptar|al\\s+confirmar|al\\s+contratar|al\\s+inicio|al\\s+comenzar|(?:de|como)\\s+(?:seña|sena|anticipo|adelanto)|seña|sena|anticipo|adelanto)'
/** Un porcentaje de 1 o 2 cifras que no sea parte de un número más largo (así «100%» no cuenta). */
const NUMERO = '(?<![\\d.,])(\\d{1,2}(?:[.,]\\d+)?)'
const PORCENTAJE_ANTES = new RegExp(`${NUMERO}\\s*%\\s*${MOMENTO}`)
const PORCENTAJE_DESPUES = new RegExp(`(?:seña|sena|anticipo|adelanto)\\s*(?:del?\\s*)?${NUMERO}\\s*%`)
const PALABRA_SENA = /(?:^|[^a-zñ])(?:seña|sena|anticipo)(?:$|[^a-zñ])/

/**
 * Porcentaje que se cobra como seña, o null si la forma de pago no tiene seña.
 * Entiende cómo lo escribe la gente: «50% al aceptar y 50% a la entrega», «50 % al aceptar»,
 * «30% de anticipo», «Seña del 40%», «Seña y saldo contra entrega» (sin número: 50 %).
 * «100% por adelantado» no es seña: es el pago total.
 */
export function porcentajeSena(formaPago?: string): number | null {
  const texto = (formaPago ?? '').toLowerCase()
  if (!texto.trim()) return null
  const numero = texto.match(PORCENTAJE_ANTES)?.[1] ?? texto.match(PORCENTAJE_DESPUES)?.[1]
  if (numero) {
    const valor = Number(numero.replace(',', '.'))
    return valor > 0 && valor < 100 ? valor : null
  }
  return PALABRA_SENA.test(texto) ? 50 : null
}

export const requiereSena = (formaPago?: string) => porcentajeSena(formaPago) !== null

/** Importe de la seña y del saldo, redondeados a centavos. */
export function partesSena(total: number, formaPago?: string) {
  const porcentaje = porcentajeSena(formaPago) ?? 50
  const sena = Math.round(total * porcentaje) / 100
  return { porcentaje, sena, saldo: Math.round((total - sena) * 100) / 100 }
}
