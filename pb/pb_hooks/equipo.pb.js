/// <reference path="../pb_data/types.d.ts" />
// El administrador de una empresa restablece la contraseña de uno de sus empleados.
// (Las reglas de la colección no lo permiten porque PocketBase exige la contraseña anterior.)

routerAdd('POST', '/api/equipo/{id}/clave', (e) => {
  const yo = e.auth
  if (!yo || yo.getString('rol') !== 'admin') {
    throw new ForbiddenError('Solo un administrador puede restablecer contraseñas.')
  }
  const clave = String((e.requestInfo().body || {}).password || '')
  if (clave.length < 8 || clave.length > 71) {
    throw new BadRequestError('La contraseña tiene que tener entre 8 y 71 caracteres.')
  }
  let empleado
  try { empleado = e.app.findRecordById('users', e.request.pathValue('id')) }
  catch (_) { throw new NotFoundError('No se encontró al empleado.') }
  // Solo empleados (rol "miembro") de la misma empresa que el administrador.
  if (empleado.getString('empresa') !== yo.getString('empresa') || empleado.getString('rol') !== 'miembro') {
    throw new NotFoundError('No se encontró al empleado.')
  }
  empleado.setPassword(clave)
  e.app.save(empleado)
  return e.json(200, { ok: true })
}, $apis.requireAuth('users'))
