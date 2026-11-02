/// <reference path="../pb_data/types.d.ts" />
// Guarda la moneda original de los ítems y presupuestos.

migrate((app) => {
  const items = app.findCollectionByNameOrId('items')
  if (!items.fields.getByName('moneda')) items.fields.add(new TextField({ name: 'moneda', max: 8 }))
  app.save(items)

  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  if (!presupuestos.fields.getByName('moneda')) presupuestos.fields.add(new TextField({ name: 'moneda', max: 8 }))
  app.save(presupuestos)
}, (app) => {
  const items = app.findCollectionByNameOrId('items')
  items.fields.removeByName('moneda')
  app.save(items)

  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  presupuestos.fields.removeByName('moneda')
  app.save(presupuestos)
})
