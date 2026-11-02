/// <reference path="../pb_data/types.d.ts" />
// Equipo: el administrador de cada empresa crea y gestiona a sus empleados (rol "miembro") dentro de su empresa.
// Propietario: los datos y la marca de la empresa los gestiona solo el superusuario.

migrate((app) => {
  const admin = '@request.auth.rol = "admin" && @request.auth.empresa != ""'
  const mismaEmpresa = 'empresa = @request.auth.empresa'

  const users = app.findCollectionByNameOrId('users')
  // Solo un admin crea usuarios, solo de su empresa y solo con rol "miembro" (los admins los crea el propietario).
  users.createRule = admin + ' && @request.body.empresa = @request.auth.empresa && @request.body.rol = "miembro"'
  // Cada uno edita lo suyo; el admin también edita a los miembros de su empresa. Nadie cambia empresa ni rol.
  users.updateRule = '(id = @request.auth.id || (' + admin + ' && ' + mismaEmpresa + ' && rol = "miembro")) && @request.body.empresa:isset = false && @request.body.rol:isset = false'
  users.deleteRule = admin + ' && ' + mismaEmpresa + ' && rol = "miembro"'
  app.save(users)

  // El equipo tiene que poder ver el correo de sus compañeros en el listado.
  app.db().newQuery('UPDATE users SET emailVisibility = 1').execute()

  // Los datos de la empresa y su marca los cambia el propietario (superusuario), no los usuarios.
  const empresa = app.findCollectionByNameOrId('empresa')
  empresa.updateRule = null
  app.save(empresa)
}, (app) => {
  const users = app.findCollectionByNameOrId('users')
  users.createRule = null
  users.updateRule = 'id = @request.auth.id && @request.body.empresa:isset = false && @request.body.rol:isset = false'
  users.deleteRule = null
  app.save(users)
  const empresa = app.findCollectionByNameOrId('empresa')
  empresa.updateRule = 'id = @request.auth.empresa && @request.auth.rol = "admin"'
  app.save(empresa)
})
