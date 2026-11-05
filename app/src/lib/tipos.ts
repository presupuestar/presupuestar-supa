export type Estado = 'borrador' | 'pendiente' | 'aceptado' | 'rechazado'

export const PERMISOS_EMPRESA = [
  { codigo: 'catalog.view', nombre: 'Ver catálogo' },
  { codigo: 'catalog.manage', nombre: 'Administrar catálogo' },
  { codigo: 'clients.manage', nombre: 'Administrar clientes' },
  { codigo: 'quotes.create', nombre: 'Crear presupuestos (incluye ver los propios)' },
  { codigo: 'quotes.view_own', nombre: 'Ver presupuestos propios' },
  { codigo: 'quotes.view_all', nombre: 'Ver presupuestos de todo el equipo' },
  { codigo: 'quotes.update_own', nombre: 'Editar presupuestos propios' },
  { codigo: 'quotes.delete_own', nombre: 'Eliminar presupuestos propios' },
] as const

export type PermisoEmpresa = typeof PERMISOS_EMPRESA[number]['codigo']

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
  /** Origen de la tasa (obligatorio si la moneda no es ARS o hay conversión). */
  cotizacionFuente?: string
  /** Último día inclusive de vigencia comercial. */
  vigenteHasta?: string
  fechaRespuesta?: string
  created: string
  updated: string
}

/** Integrante del equipo de una empresa. */
export interface UsuarioEquipo {
  id: string
  email: string
  name?: string
  rol: string
  primerAccesoClaveRespondido?: boolean
  empresa: string
  created: string
}

export interface RolEmpresa {
  id: string
  nombre: string
  permisos: PermisoEmpresa[]
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
