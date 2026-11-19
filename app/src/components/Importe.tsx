import { importeEnMoneda } from '../lib/formato'

/**
 * Importe con la moneda y los centavos en un tono más suave, para que se lea
 * primero lo importante: «ARS 287.500,50».
 */
export function Importe({ valor, moneda }: { valor: number; moneda?: string }) {
  const texto = importeEnMoneda(valor, moneda)
  const espacio = texto.indexOf(' ')
  const codigo = texto.slice(0, espacio)
  const numero = texto.slice(espacio + 1)
  const coma = numero.lastIndexOf(',')
  return (
    <span className="importe">
      <span className="importe-moneda">{codigo}</span>{' '}
      <span>{coma === -1 ? numero : numero.slice(0, coma)}</span>
      {coma !== -1 && <span className="importe-centavos">{numero.slice(coma)}</span>}
    </span>
  )
}
