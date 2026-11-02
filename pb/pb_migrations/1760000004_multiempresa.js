/// <reference path="../pb_data/types.d.ts" />
// Multiempresa: cada empresa ve solo sus propios usuarios, clientes, ítems y presupuestos.
// Si ya había datos, se asignan a la primera empresa registrada.

migrate((app) => {
  const colEmpresa = app.findCollectionByNameOrId('empresa')
  const primera = app.findAllRecords('empresa')[0]

  // 1) Campo "empresa" (todavía opcional) en cada colección + rol en los usuarios
  for (const nombre of ['items', 'clientes', 'presupuestos', 'users']) {
    const c = app.findCollectionByNameOrId(nombre)
    if (!c.fields.getByName('empresa')) {
      c.fields.add(new RelationField({ name: 'empresa', collectionId: colEmpresa.id, maxSelect: 1, cascadeDelete: false }))
    }
    if (nombre === 'users' && !c.fields.getByName('rol')) {
      c.fields.add(new SelectField({ name: 'rol', maxSelect: 1, values: ['admin', 'miembro'] }))
    }
    app.save(c)
    // Los datos que ya existían quedan asignados a la primera empresa (se usa SQL para no disparar los hooks).
    if (primera) {
      app.db().newQuery(`UPDATE ${nombre} SET empresa = {:e} WHERE empresa = '' OR empresa IS NULL`).bind({ e: primera.id }).execute()
    }
  }
  if (primera) app.db().newQuery(`UPDATE users SET rol = 'admin' WHERE rol = '' OR rol IS NULL`).execute()

  // 2) Empresa obligatoria + reglas: cada usuario solo accede a los registros de su empresa
  const propia = '@request.auth.empresa != "" && empresa = @request.auth.empresa'
  const alta = '@request.auth.empresa != "" && @request.body.empresa = @request.auth.empresa'
  const edicion = propia + ' && (@request.body.empresa:isset = false || @request.body.empresa = @request.auth.empresa)'
  // un presupuesto solo puede apuntar a un cliente de la misma empresa
  const clienteMismaEmpresa = ' && (@request.body.cliente:isset = false || @request.body.cliente = "" || @request.body.cliente.empresa = @request.auth.empresa)'

  for (const nombre of ['items', 'clientes', 'presupuestos']) {
    const c = app.findCollectionByNameOrId(nombre)
    c.fields.getByName('empresa').required = true
    const extra = nombre === 'presupuestos' ? clienteMismaEmpresa : ''
    c.listRule = propia
    c.viewRule = propia
    c.createRule = alta + extra
    c.updateRule = edicion + extra
    c.deleteRule = propia
    if (nombre === 'presupuestos') {
      // el número de presupuesto es correlativo dentro de cada empresa
      c.indexes = ['CREATE UNIQUE INDEX idx_presupuestos_empresa_numero ON presupuestos (empresa, numero)']
    }
    app.save(c)
  }

  // La empresa solo se ve (y los administradores la editan) desde sus propios usuarios.
  colEmpresa.listRule = 'id = @request.auth.empresa'
  colEmpresa.viewRule = 'id = @request.auth.empresa'
  colEmpresa.createRule = null
  colEmpresa.updateRule = 'id = @request.auth.empresa && @request.auth.rol = "admin"'
  colEmpresa.deleteRule = null
  app.save(colEmpresa)

  // Usuarios: los crea el superusuario; cada uno ve a su equipo y no puede cambiarse de empresa ni de rol.
  const users = app.findCollectionByNameOrId('users')
  users.fields.getByName('empresa').required = true
  users.fields.getByName('rol').required = true
  users.listRule = propia
  users.viewRule = propia
  users.createRule = null
  users.updateRule = 'id = @request.auth.id && @request.body.empresa:isset = false && @request.body.rol:isset = false'
  users.deleteRule = null
  app.save(users)
}, (app) => {
  const autenticado = '@request.auth.id != ""'
  for (const nombre of ['items', 'clientes', 'presupuestos']) {
    const c = app.findCollectionByNameOrId(nombre)
    c.listRule = c.viewRule = c.createRule = c.updateRule = c.deleteRule = autenticado
    c.fields.removeByName('empresa')
    if (nombre === 'presupuestos') c.indexes = ['CREATE UNIQUE INDEX idx_presupuestos_numero ON presupuestos (numero)']
    app.save(c)
  }
  const empresa = app.findCollectionByNameOrId('empresa')
  empresa.listRule = ''; empresa.viewRule = ''; empresa.updateRule = autenticado
  app.save(empresa)
  const users = app.findCollectionByNameOrId('users')
  users.fields.removeByName('empresa'); users.fields.removeByName('rol')
  users.listRule = 'id = @request.auth.id'; users.viewRule = 'id = @request.auth.id'
  users.updateRule = 'id = @request.auth.id'
  app.save(users)
})
