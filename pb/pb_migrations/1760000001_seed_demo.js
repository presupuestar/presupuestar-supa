/// <reference path="../pb_data/types.d.ts" />
// Datos de ejemplo: una empresa con branding por defecto y un catálogo chico.
// Podés editarlos o borrarlos desde el panel o desde la app.

migrate((app) => {
  const empresa = new Record(app.findCollectionByNameOrId('empresa'))
  empresa.set('nombre', 'Tu Empresa S.R.L.')
  empresa.set('colorPrimario', '#0B2545')
  empresa.set('colorAcento', '#5BB5F0')
  empresa.set('fuenteTitulos', 'Poppins')
  empresa.set('fuenteTexto', 'Poppins')
  empresa.set('validezDias', 15)
  empresa.set('condiciones', 'Precios expresados en pesos argentinos.')
  empresa.set('mostrarSello', true)
  app.save(empresa)

  const items = app.findCollectionByNameOrId('items')
  for (const [nombre, unidad, precio] of [
    ['Diseño de sitio web', 'unidad', 450000],
    ['Logo y manual de marca', 'unidad', 220000],
    ['Hosting anual', 'año', 80000],
    ['Soporte mensual', 'mes', 30000],
  ]) {
    const r = new Record(items)
    r.set('nombre', nombre); r.set('unidad', unidad); r.set('precio', precio); r.set('activo', true)
    app.save(r)
  }
}, (app) => {
  for (const name of ['items', 'empresa']) {
    const col = app.findCollectionByNameOrId(name)
    for (const r of app.findAllRecords(col)) app.delete(r)
  }
})
