export type Estado = 'borrador' | 'pendiente' | 'aceptado' | 'rechazado'

export interface Empresa {
  id: string
  nombre: string
  documento?: string
  email?: string
  telefono?: string
  logo?: string
  colorPrimario: string
  colorAcento: string
  fuenteTitulos?: string
  fuenteTexto?: string
  fuenteTitulosArchivo?: string
  fuenteTextoArchivo?: string
  validezDias?: number
  condiciones?: string
  mostrarSello?: boolean
  created?: string
  updated?: string
}

export interface Item {
  id: string
  empresa: string
  nombre: string
  descripcion?: string
  proveedor?: string
  unidad?: string
  precio: number
  moneda?: string
  activo: boolean
}

/** Datos de contacto y facturación del cliente. */
export interface Cliente {
  id: string
  empresa: string
  nombre: string
  email: string
  telefono: string
  documento?: string
  direccion?: string
}

/** Copia fija de lo presupuestado. itemId = null → ítem personalizado. */
export interface Linea {
  itemId: string | null
  descripcion: string
  detalle?: string
  cantidad: number
  precioUnitario: number
  moneda?: string
  precioOrigen?: number
  monedaOrigen?: string
}

export type ClienteDatos = Omit<Cliente, 'id' | 'empresa'>

export interface Presupuesto {
  id: string
  empresa: string
  numero: number
  estado: Estado
  fechaEmision: string
  validezDias?: number
  plazo?: string
  formaPago?: string
  notas?: string
  ganancia?: number
  cliente?: string
  clienteDatos: ClienteDatos
  lineas: Linea[]
  /** Quién lo hizo: lo fija el servidor con el usuario que inició sesión. */
  vendedor?: string
  vendedorNombre?: string
  vendedorEmail?: string
  total: number
  moneda?: string
  cotizacionDolar?: number
  cotizacionFecha?: string
  fechaRespuesta?: string
  created: string
  updated: string
}

/** Integrante del equipo de una empresa. */
export interface UsuarioEquipo {
  id: string
  email: string
  name?: string
  rol: 'admin' | 'miembro'
  primerAccesoClaveRespondido?: boolean
  empresa: string
  created: string
}

/** Ventas de una persona del equipo: "vendido" es lo que el cliente aceptó. */
export interface ResumenVendedor {
  clave: string // correo del vendedor ('' = sin asignar: presupuestos anteriores a esta función)
  nombre: string
  email: string
  cantidad: number // emitidos (sin borradores)
  aceptados: number
  presupuestado: number
  vendido: number
  rechazado: number
  pendiente: number
  conversionPct: number
  moneda?: string
}

export interface ResumenMes {
  mes: string // AAAA-MM
  moneda?: string
  cantidad: number
  presupuestado: number
  aceptado: number
  rechazado: number
  pendiente: number
  ganancia: number
  conversionPct: number
  aceptadosCantidad: number
}
