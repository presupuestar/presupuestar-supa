/// <reference path="../pb_data/types.d.ts" />
// Cada usuario decide una sola vez si cambia la contraseña al iniciar sesión por primera vez.

migrate((app) => {
  const users = app.findCollectionByNameOrId('users')
  if (!users.fields.getByName('primerAccesoClaveRespondido')) {
    users.fields.add(new BoolField({ name: 'primerAccesoClaveRespondido' }))
    app.db().newQuery('UPDATE users SET primerAccesoClaveRespondido = 1').execute()
    app.save(users)
  }
}, (app) => {
  const users = app.findCollectionByNameOrId('users')
  if (users.fields.getByName('primerAccesoClaveRespondido')) {
    users.fields.removeByName('primerAccesoClaveRespondido')
    app.save(users)
  }
})