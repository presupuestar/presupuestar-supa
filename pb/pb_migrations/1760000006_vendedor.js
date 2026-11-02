/// <reference path="../pb_data/types.d.ts" />
// Cada presupuesto guarda qué usuario lo hizo (vendedor). Los administradores ven todos los presupuestos de su empresa;
// cada empleado ve solo los que hizo él.

migrate((app) => {
  const users = app.findCollectionByNameOrId('users')
  const p = app.findCollectionByNameOrId('presupuestos')

  if (!p.fields.getByName('vendedor')) p.fields.add(new RelationField({ name: 'vendedor', collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
  // Copia del nombre y el correo al momento de crearlo: el historial de ventas se mantiene aunque el empleado se elimine.
  if (!p.fields.getByName('vendedorNombre')) p.fields.add(new TextField({ name: 'vendedorNombre', max: 160 }))
  if (!p.fields.getByName('vendedorEmail')) p.fields.add(new TextField({ name: 'vendedorEmail', max: 200 }))

  const propia = '@request.auth.empresa != "" && empresa = @request.auth.empresa'
  const alta = '@request.auth.empresa != "" && @request.body.empresa = @request.auth.empresa'
  const clienteMismaEmpresa = ' && (@request.body.cliente:isset = false || @request.body.cliente = "" || @request.body.cliente.empresa = @request.auth.empresa)'
  // el vendedor lo fija el servidor: el cliente no puede enviarlo ni cambiarlo
  const sinVendedor = ' && @request.body.vendedor:isset = false && @request.body.vendedorNombre:isset = false && @request.body.vendedorEmail:isset = false'
  const verPropios = propia + ' && (@request.auth.rol = "admin" || vendedor = @request.auth.id)'

  p.listRule = verPropios
  p.viewRule = verPropios
  p.createRule = alta + clienteMismaEmpresa + sinVendedor
  p.updateRule = verPropios + ' && (@request.body.empresa:isset = false || @request.body.empresa = @request.auth.empresa)' + clienteMismaEmpresa + sinVendedor
  p.deleteRule = verPropios
  app.save(p)
}, (app) => {
  const p = app.findCollectionByNameOrId('presupuestos')
  const propia = '@request.auth.empresa != "" && empresa = @request.auth.empresa'
  const alta = '@request.auth.empresa != "" && @request.body.empresa = @request.auth.empresa'
  const clienteMismaEmpresa = ' && (@request.body.cliente:isset = false || @request.body.cliente = "" || @request.body.cliente.empresa = @request.auth.empresa)'
  for (const campo of ['vendedor', 'vendedorNombre', 'vendedorEmail']) p.fields.removeByName(campo)
  p.listRule = propia; p.viewRule = propia; p.deleteRule = propia
  p.createRule = alta + clienteMismaEmpresa
  p.updateRule = propia + ' && (@request.body.empresa:isset = false || @request.body.empresa = @request.auth.empresa)' + clienteMismaEmpresa
  app.save(p)
})
