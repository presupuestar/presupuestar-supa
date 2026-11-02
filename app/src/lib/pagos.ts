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

export const requiereSena = (formaPago?: string) =>
  Boolean(formaPago && /50%\s*al\s*aceptar/i.test(formaPago))
