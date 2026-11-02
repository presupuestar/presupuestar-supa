/// <reference path="../pb_data/types.d.ts" />
// PresupuestAR · colecciones iniciales (empresa, items, clientes, presupuestos)

migrate((app) => {
  const autenticado = '@request.auth.id != ""'
  const fechas = [
    { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
  ]

  // 1) Configuración de la empresa (un único registro) + branding
  app.save(new Collection({
    type: 'base',
    name: 'empresa',
    listRule: '',            // el branding es público: lo necesita la pantalla de login
    viewRule: '',
    createRule: null,        // solo superusuario
    updateRule: autenticado,
    deleteRule: null,
    fields: [
      { type: 'text', name: 'nombre', required: true, max: 120 },
      { type: 'text', name: 'documento', max: 30 },
      { type: 'email', name: 'email' },
      { type: 'text', name: 'telefono', max: 40 },
      { type: 'file', name: 'logo', maxSelect: 1, maxSize: 2 * 1024 * 1024,
        mimeTypes: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'] },
      { type: 'text', name: 'colorPrimario', required: true, pattern: '^#[0-9A-Fa-f]{6}$' },
      { type: 'text', name: 'colorAcento', required: true, pattern: '^#[0-9A-Fa-f]{6}$' },
      { type: 'text', name: 'fuenteTitulos', max: 80 },   // nombre en Google Fonts
      { type: 'text', name: 'fuenteTexto', max: 80 },
      { type: 'file', name: 'fuenteTitulosArchivo', maxSelect: 1, maxSize: 5 * 1024 * 1024 }, // .ttf / .woff2 propios
      { type: 'file', name: 'fuenteTextoArchivo', maxSelect: 1, maxSize: 5 * 1024 * 1024 },
      { type: 'number', name: 'validezDias', min: 1, onlyInt: true },
      { type: 'text', name: 'condiciones', max: 2000 },
      { type: 'bool', name: 'mostrarSello' },
      ...fechas,
    ],
  }))

  // 2) Catálogo de ítems con precio definido
  app.save(new Collection({
    type: 'base',
    name: 'items',
    listRule: autenticado, viewRule: autenticado,
    createRule: autenticado, updateRule: autenticado, deleteRule: autenticado,
    fields: [
      { type: 'text', name: 'nombre', required: true, max: 160 },
      { type: 'text', name: 'descripcion', max: 500 },
      { type: 'text', name: 'unidad', max: 30 },
      { type: 'number', name: 'precio', required: true, min: 0 },
      { type: 'bool', name: 'activo' },
      ...fechas,
    ],
  }))

  // 3) Clientes
  const clientes = new Collection({
    type: 'base',
    name: 'clientes',
    listRule: autenticado, viewRule: autenticado,
    createRule: autenticado, updateRule: autenticado, deleteRule: autenticado,
    fields: [
      { type: 'text', name: 'nombre', required: true, max: 160 },   // nombre completo
      { type: 'email', name: 'email', required: true },
      { type: 'text', name: 'telefono', required: true, max: 40 },
      ...fechas,
    ],
  })
  app.save(clientes)

  // 4) Presupuestos. Las líneas (ítems del catálogo y personalizados) van en JSON:
  //    cada línea es una copia fija de lo presupuestado. itemId = null => ítem personalizado.
  app.save(new Collection({
    type: 'base',
    name: 'presupuestos',
    listRule: autenticado, viewRule: autenticado,
    createRule: autenticado, updateRule: autenticado, deleteRule: autenticado,
    indexes: ['CREATE UNIQUE INDEX idx_presupuestos_numero ON presupuestos (numero)'],
    fields: [
      { type: 'number', name: 'numero', onlyInt: true },   // lo asigna el hook
      { type: 'select', name: 'estado', required: true, maxSelect: 1,
        values: ['borrador', 'pendiente', 'aceptado', 'rechazado'] },
      { type: 'date', name: 'fechaEmision' },
      { type: 'number', name: 'validezDias', min: 1, onlyInt: true },
      { type: 'text', name: 'plazo', max: 80 },
      { type: 'text', name: 'notas', max: 2000 },
      { type: 'relation', name: 'cliente', collectionId: clientes.id, maxSelect: 1, cascadeDelete: false },
      { type: 'json', name: 'clienteDatos', maxSize: 20000 },   // copia fija de los datos del cliente incluidos en el presupuesto
      { type: 'json', name: 'lineas', maxSize: 1000000 },       // [{ itemId, descripcion, cantidad, precioUnitario }]
      { type: 'number', name: 'total', min: 0 },                // lo recalcula el hook
      { type: 'date', name: 'fechaRespuesta' },
      ...fechas,
    ],
  }))
}, (app) => {
  for (const name of ['presupuestos', 'clientes', 'items', 'empresa']) {
    app.delete(app.findCollectionByNameOrId(name))
  }
})
