// Código compartido entre hooks (los handlers de PocketBase corren aislados,
// así que lo común se importa con require() dentro de cada handler).
module.exports = {
  total(record) {
    const lineas = JSON.parse(record.getString('lineas') || '[]')
    const total = (Array.isArray(lineas) ? lineas : []).reduce(
      (suma, l) => suma + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0)
    return Math.round((total + Number.EPSILON) * 100) / 100
  },

  // Solo se conservan los datos de cliente que se usan en el presupuesto y el PDF.
  clienteDatos(record) {
    let c = {}
    try { c = JSON.parse(record.getString('clienteDatos') || '{}') || {} } catch (_) {}
    const limpio = (v) => (typeof v === 'string' ? v.trim() : '')
    return {
      nombre: limpio(c.nombre), email: limpio(c.email), telefono: limpio(c.telefono),
      documento: limpio(c.documento), direccion: limpio(c.direccion),
    }
  },

  faltantes(cliente) {
    const etiquetas = { nombre: 'nombre completo', email: 'correo electrónico', telefono: 'teléfono' }
    return Object.keys(etiquetas).filter((k) => !cliente[k]).map((k) => etiquetas[k])
  },

  // Valida y normaliza un presupuesto antes de guardarlo.
  // Un borrador puede estar incompleto; uno emitido necesita los tres datos del cliente.
  preparar(record) {
    const lineas = JSON.parse(record.getString('lineas') || '[]')
    const monedas = [...new Set((Array.isArray(lineas) ? lineas : [])
      .map((linea) => (typeof linea.moneda === 'string' ? linea.moneda.trim().toUpperCase() : '') || 'ARS'))]
    if (monedas.length > 1) throw new BadRequestError('Un presupuesto no puede mezclar precios de distintas monedas.')
    const moneda = monedas[0] || (record.getString('moneda').trim().toUpperCase() || 'ARS')
    const cotizacionDolar = Number(record.get('cotizacionDolar') || 0)
    const cotizacionFecha = record.getString('cotizacionFecha').trim()
    if (!Number.isFinite(cotizacionDolar) || cotizacionDolar < 0) throw new BadRequestError('La cotización del dólar debe ser un importe mayor o igual a 0.')
    if (cotizacionDolar > 0 && (!cotizacionFecha || moneda !== 'ARS')) throw new BadRequestError('La cotización blue requiere una fecha y un presupuesto en ARS.')
    record.set('moneda', moneda)
    record.set('cotizacionDolar', cotizacionDolar)
    record.set('cotizacionFecha', cotizacionFecha)
    record.set('lineas', (Array.isArray(lineas) ? lineas : []).map((linea) => ({
      ...linea,
      moneda: (typeof linea.moneda === 'string' ? linea.moneda.trim().toUpperCase() : '') || moneda,
    })))
    const cliente = this.clienteDatos(record)
    if (record.getString('estado') !== 'borrador') {
      const faltan = this.faltantes(cliente)
      if (faltan.length) throw new BadRequestError('Faltan datos del cliente: ' + faltan.join(', ') + '.')
    }
    record.set('clienteDatos', cliente)
    record.set('total', this.total(record))
    const ganancia = Number(record.get('ganancia') || 0)
    if (!Number.isFinite(ganancia) || ganancia < 0) throw new BadRequestError('La ganancia debe ser un importe igual o mayor a 0.')
    record.set('ganancia', ganancia)
  },
}
