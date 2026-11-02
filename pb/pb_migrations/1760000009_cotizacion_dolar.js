/// <reference path="../pb_data/types.d.ts" />
// Conserva la cotización blue aplicada al convertir precios USD en presupuestos.

migrate((app) => {
  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  if (!presupuestos.fields.getByName('cotizacionDolar')) presupuestos.fields.add(new NumberField({ name: 'cotizacionDolar', min: 0 }))
  if (!presupuestos.fields.getByName('cotizacionFecha')) presupuestos.fields.add(new TextField({ name: 'cotizacionFecha', max: 40 }))
  app.save(presupuestos)
}, (app) => {
  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  presupuestos.fields.removeByName('cotizacionDolar')
  presupuestos.fields.removeByName('cotizacionFecha')
  app.save(presupuestos)
})
