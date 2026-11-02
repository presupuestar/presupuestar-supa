/// <reference path="../pb_data/types.d.ts" />
// Proveedor interno para el catálogo, datos de facturación del cliente y ganancia del presupuesto.

migrate((app) => {
  const items = app.findCollectionByNameOrId('items')
  if (!items.fields.getByName('proveedor')) items.fields.add(new TextField({ name: 'proveedor', max: 160 }))
  app.save(items)

  const clientes = app.findCollectionByNameOrId('clientes')
  if (!clientes.fields.getByName('documento')) clientes.fields.add(new TextField({ name: 'documento', max: 40 }))
  if (!clientes.fields.getByName('direccion')) clientes.fields.add(new TextField({ name: 'direccion', max: 300 }))
  app.save(clientes)

  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  if (!presupuestos.fields.getByName('ganancia')) presupuestos.fields.add(new NumberField({ name: 'ganancia', min: 0 }))
  app.save(presupuestos)
}, (app) => {
  const items = app.findCollectionByNameOrId('items')
  items.fields.removeByName('proveedor')
  app.save(items)

  const clientes = app.findCollectionByNameOrId('clientes')
  clientes.fields.removeByName('documento')
  clientes.fields.removeByName('direccion')
  app.save(clientes)

  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  presupuestos.fields.removeByName('ganancia')
  app.save(presupuestos)
})
