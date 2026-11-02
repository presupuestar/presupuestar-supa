/// <reference path="../pb_data/types.d.ts" />
// Datos mínimos obligatorios del cliente: nombre completo, correo electrónico y teléfono.
// Para bases que ya tenían la colección con el campo "documento".

migrate((app) => {
  const clientes = app.findCollectionByNameOrId('clientes')
  clientes.fields.removeByName('documento')
  clientes.fields.getByName('email').required = true
  clientes.fields.getByName('telefono').required = true
  app.save(clientes)
}, (app) => {
  const clientes = app.findCollectionByNameOrId('clientes')
  clientes.fields.add(new TextField({ name: 'documento', max: 30 }))
  clientes.fields.getByName('email').required = false
  clientes.fields.getByName('telefono').required = false
  app.save(clientes)
})
