export function validarCodigoMoneda(value: string): string | null {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return null
  try {
    if (typeof Intl.supportedValuesOf === 'function' && !Intl.supportedValuesOf('currency').includes(code)) return null
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: code }).format(0)
    return code
  } catch {
    return null
  }
}
