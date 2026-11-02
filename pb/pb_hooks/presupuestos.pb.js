/// <reference path="../pb_data/types.d.ts" />
// Numeración correlativa por empresa, total calculado y datos del cliente validados en el servidor.
// (Los handlers corren aislados: la lógica compartida vive en lib/calculo.js.)

// Al crear: queda registrado quién lo hizo (lo fija el servidor con el usuario que inició sesión).
onRecordCreateRequest((e) => {
  if (e.auth && !e.auth.isSuperuser()) {
    e.record.set('vendedor', e.auth.id)
    e.record.set('vendedorEmail', e.auth.getString('email'))
    e.record.set('vendedorNombre', e.auth.getString('name') || e.auth.getString('email'))
  }
  e.next()
}, 'presupuestos')

// Al crear: siguiente número de presupuesto.
// SQLite escribe de a una operación, así que dos usuarios no pueden obtener el mismo número.
onRecordCreate((e) => {
  require(`${__hooks}/lib/calculo.js`).preparar(e.record)
  // numeración correlativa dentro de cada empresa
  const ultimos = e.app.findRecordsByFilter('presupuestos', 'empresa = {:e} && numero > 0', '-numero', 1, 0, { e: e.record.getString('empresa') })
  e.record.set('numero', ultimos.length ? ultimos[0].getInt('numero') + 1 : 1)
  e.next()
}, 'presupuestos')

// Al editar: revalida y recalcula, y registra cuándo se aceptó o rechazó.
onRecordUpdate((e) => {
  require(`${__hooks}/lib/calculo.js`).preparar(e.record)
  const estado = e.record.getString('estado')
  if (estado === 'aceptado' || estado === 'rechazado') {
    if (!e.record.getString('fechaRespuesta')) e.record.set('fechaRespuesta', new Date().toISOString().replace('T', ' '))
  } else {
    e.record.set('fechaRespuesta', '') // al volver a pendiente se borra la fecha de respuesta
  }
  e.next()
}, 'presupuestos')
