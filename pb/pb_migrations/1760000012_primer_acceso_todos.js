/// <reference path="../pb_data/types.d.ts" />
// La pregunta de cambio de contraseña aparece una vez también para las cuentas ya existentes.

migrate((app) => {
  const users = app.findCollectionByNameOrId('users')
  if (!users.fields.getByName('primerAccesoClaveRespondido')) {
    users.fields.add(new BoolField({ name: 'primerAccesoClaveRespondido' }))
    app.save(users)
  }
  app.db().newQuery('UPDATE users SET primerAccesoClaveRespondido = 0').execute()
}, (app) => {
  app.db().newQuery('UPDATE users SET primerAccesoClaveRespondido = 1').execute()
})
