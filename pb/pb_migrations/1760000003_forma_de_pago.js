/// <reference path="../pb_data/types.d.ts" />
// Forma de pago elegible en cada presupuesto (50/50, contra entrega, anticipo, la que quiera el usuario).

migrate((app) => {
  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  if (!presupuestos.fields.getByName('formaPago')) {
    presupuestos.fields.add(new TextField({ name: 'formaPago', max: 300 }))
    app.save(presupuestos)
  }

  // El texto de ejemplo de la empresa fijaba "50% al aceptar y 50% a la entrega" en todos los PDF:
  // si todavía es el de ejemplo, se deja neutro (la forma de pago ahora se elige por presupuesto).
  const ejemplo = 'Validez: 15 días. Pago: 50% al aceptar y 50% a la entrega. Precios en pesos argentinos.'
  for (const empresa of app.findAllRecords('empresa')) {
    if (empresa.getString('condiciones') === ejemplo) {
      empresa.set('condiciones', 'Precios expresados en pesos argentinos.')
      app.save(empresa)
    }
  }
}, (app) => {
  const presupuestos = app.findCollectionByNameOrId('presupuestos')
  presupuestos.fields.removeByName('formaPago')
  app.save(presupuestos)
})
