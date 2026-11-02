/// <reference path="../pb_data/types.d.ts" />
// Asegura que los ítems puedan persistir la moneda indicada por el catálogo.

migrate((app) => {
  const items = app.findCollectionByNameOrId('items')
  if (!items.fields.fieldNames().includes('moneda')) {
    items.fields.add(new TextField({ name: 'moneda', max: 8 }))
    app.save(items)
  }
}, (app) => {
  const items = app.findCollectionByNameOrId('items')
  if (items.fields.fieldNames().includes('moneda')) {
    items.fields.removeByName('moneda')
    app.save(items)
  }
})
