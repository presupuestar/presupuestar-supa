import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { normalizarMoneda } from './formato'
import { PERMISOS_EMPRESA, type Cliente, type Empresa, type Estado, type Item, type Linea, type PermisoEmpresa, type Presupuesto, type ResumenMes, type ResumenVendedor, type RolEmpresa, type UsuarioEquipo } from './tipos'

type DbRow = Record<string, unknown>

const errorResult = <T>(result: { data: T | null; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('Supabase no devolvió el registro esperado.')
  return result.data
}

const empresaId = async (): Promise<string> => {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const result = await supabase.from('profiles').select('company_id').eq('user_id', userData.user.id).single()
  const id = errorResult(result).company_id
  if (typeof id !== 'string' || !id) throw new Error('Este usuario no tiene una empresa asignada.')
  return id
}

const empresaDesdeDb = (r: DbRow): Empresa => ({
  id: String(r.id),
  nombre: String(r.name),
  documento: String(r.document ?? ''),
  email: String(r.email ?? ''),
  telefono: String(r.phone ?? ''),
  logo: String(r.logo_path ?? ''),
  fuenteTitulosArchivo: String(r.title_font_path ?? ''),
  fuenteTextoArchivo: String(r.text_font_path ?? ''),
  colorPrimario: String(r.primary_color),
  colorAcento: String(r.accent_color),
  fuenteTitulos: String(r.title_font ?? ''),
  fuenteTexto: String(r.text_font ?? ''),
  validezDias: Number(r.validity_days) || undefined,
  condiciones: String(r.terms ?? ''),
  mostrarSello: Boolean(r.show_seal),
  created: String(r.created_at ?? ''),
  updated: String(r.updated_at ?? ''),
})

const itemDesdeDb = (r: DbRow): Item => ({
  id: String(r.id),
  empresa: String(r.company_id),
  nombre: String(r.name),
  descripcion: String(r.description ?? ''),
  proveedor: String(r.supplier ?? ''),
  unidad: String(r.unit ?? ''),
  precio: Number(r.price),
  moneda: String(r.currency ?? 'ARS'),
  activo: Boolean(r.active),
})

const clienteDesdeDb = (r: DbRow): Cliente => ({
  id: String(r.id),
  empresa: String(r.company_id),
  nombre: String(r.name),
  email: String(r.email),
  telefono: String(r.phone),
  documento: String(r.document ?? ''),
  direccion: String(r.address ?? ''),
})

const presupuestoDesdeDb = (r: DbRow): Presupuesto => ({
  id: String(r.id),
  empresa: String(r.company_id),
  numero: Number(r.number),
  estado: r.status as Estado,
  fechaEmision: String(r.issue_date ?? ''),
  validezDias: Number(r.validity_days) || undefined,
  plazo: String(r.delivery_time ?? ''),
  formaPago: String(r.payment_terms ?? ''),
  notas: String(r.notes ?? ''),
  ganancia: Number(r.profit) || 0,
  cliente: String(r.client_id ?? ''),
  clienteDatos: r.client_snapshot as Presupuesto['clienteDatos'],
  lineas: r.lines as Linea[],
  vendedor: String(r.seller_id ?? ''),
  vendedorNombre: String(r.seller_name ?? ''),
  vendedorEmail: String(r.seller_email ?? ''),
  total: Number(r.total),
  moneda: String(r.currency ?? 'ARS'),
  cotizacionDolar: Number(r.exchange_rate) || 0,
  cotizacionFecha: String(r.exchange_rate_date ?? ''),
  fechaRespuesta: String(r.answered_at ?? ''),
  created: String(r.created_at ?? ''),
  updated: String(r.updated_at ?? ''),
})

const itemAColumna = (d: Partial<Item>) => ({
  ...(d.nombre !== undefined ? { name: d.nombre } : {}),
  ...(d.descripcion !== undefined ? { description: d.descripcion } : {}),
  ...(d.proveedor !== undefined ? { supplier: d.proveedor } : {}),
  ...(d.unidad !== undefined ? { unit: d.unidad } : {}),
  ...(d.precio !== undefined ? { price: d.precio } : {}),
  ...(d.moneda !== undefined ? { currency: d.moneda } : {}),
  ...(d.activo !== undefined ? { active: d.activo } : {}),
})

const clienteAColumna = (d: Partial<Cliente>) => ({
  ...(d.nombre !== undefined ? { name: d.nombre } : {}),
  ...(d.email !== undefined ? { email: d.email } : {}),
  ...(d.telefono !== undefined ? { phone: d.telefono } : {}),
  ...(d.documento !== undefined ? { document: d.documento } : {}),
  ...(d.direccion !== undefined ? { address: d.direccion } : {}),
})

const presupuestoAColumna = (d: Partial<Presupuesto>) => ({
  ...(d.estado !== undefined ? { status: d.estado } : {}),
  ...(d.fechaEmision !== undefined ? { issue_date: d.fechaEmision || null } : {}),
  ...(d.validezDias !== undefined ? { validity_days: d.validezDias || null } : {}),
  ...(d.plazo !== undefined ? { delivery_time: d.plazo } : {}),
  ...(d.formaPago !== undefined ? { payment_terms: d.formaPago } : {}),
  ...(d.notas !== undefined ? { notes: d.notas } : {}),
  ...(d.cliente !== undefined ? { client_id: d.cliente || null } : {}),
  ...(d.clienteDatos !== undefined ? { client_snapshot: d.clienteDatos } : {}),
  ...(d.lineas !== undefined ? { lines: d.lineas } : {}),
  ...(d.ganancia !== undefined ? { profit: d.ganancia } : {}),
  ...(d.moneda !== undefined ? { currency: d.moneda } : {}),
  ...(d.cotizacionDolar !== undefined ? { exchange_rate: d.cotizacionDolar } : {}),
  ...(d.cotizacionFecha !== undefined ? { exchange_rate_date: d.cotizacionFecha } : {}),
})

const dinero = (n: number) => Math.round(n * 100) / 100
const escaparLike = (value: string) => value.replace(/[\\%_,]/g, '\\$&').replace(/"/g, '\\"')
const permisosMiembro = PERMISOS_EMPRESA
  .map(({ codigo }) => codigo)
  .filter((codigo) => codigo !== 'quotes.view_all') as PermisoEmpresa[]
const rolDesdeDb = (r: DbRow): RolEmpresa => ({
  id: String(r.id),
  nombre: String(r.name),
  permisos: Array.isArray(r.permissions)
    ? r.permissions.filter((value): value is PermisoEmpresa => PERMISOS_EMPRESA.some((p) => p.codigo === value))
    : [],
})

export const totalLineas = (lineas: Linea[]) =>
  dinero(lineas.reduce((suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0))

export const repositorio = {
  empresa: {
    async obtener(): Promise<Empresa> {
      const id = await empresaId()
      return empresaDesdeDb(errorResult(await supabase.from('companies').select('*').eq('id', id).single()))
    },
    archivoUrl(_empresa: Empresa, archivo?: string) {
      if (!archivo) return undefined
      return supabase.storage.from('company-assets').getPublicUrl(archivo).data.publicUrl
    },
    async actualizar(id: string, datos: Partial<Empresa>) {
      const { error } = await supabase.from('companies').update({
        ...(datos.nombre !== undefined ? { name: datos.nombre } : {}),
        ...(datos.documento !== undefined ? { document: datos.documento } : {}),
        ...(datos.email !== undefined ? { email: datos.email } : {}),
        ...(datos.telefono !== undefined ? { phone: datos.telefono } : {}),
        ...(datos.colorPrimario !== undefined ? { primary_color: datos.colorPrimario } : {}),
        ...(datos.colorAcento !== undefined ? { accent_color: datos.colorAcento } : {}),
        ...(datos.fuenteTitulos !== undefined ? { title_font: datos.fuenteTitulos } : {}),
        ...(datos.fuenteTexto !== undefined ? { text_font: datos.fuenteTexto } : {}),
        ...(datos.validezDias !== undefined ? { validity_days: datos.validezDias } : {}),
        ...(datos.condiciones !== undefined ? { terms: datos.condiciones } : {}),
        ...(datos.mostrarSello !== undefined ? { show_seal: datos.mostrarSello } : {}),
      }).eq('id', id)
      if (error) throw error
    },
  },

  items: {
    async listar(soloActivos = true) {
      let query = supabase.from('items').select('*').order('name')
      if (soloActivos) query = query.eq('active', true)
      return errorResult(await query).map(itemDesdeDb)
    },
    async listarPagina({
      pagina, porPagina, soloActivos, busqueda, proveedor, sinProveedor,
    }: {
      pagina: number
      porPagina: number
      soloActivos: boolean
      busqueda?: string
      proveedor?: string
      sinProveedor?: boolean
    }) {
      let query = supabase.from('items').select('*', { count: 'exact' }).order('name')
      if (soloActivos) query = query.eq('active', true)
      const termino = busqueda?.trim()
      if (termino) {
        const like = `"%${escaparLike(termino)}%"`
        query = query.or(`name.ilike.${like},description.ilike.${like},supplier.ilike.${like}`)
      }
      if (sinProveedor) query = query.eq('supplier', '')
      else if (proveedor?.trim()) query = query.ilike('supplier', `%${escaparLike(proveedor.trim())}%`)
      const from = (pagina - 1) * porPagina
      const { data, count, error } = await query.range(from, from + porPagina - 1)
      if (error) throw error
      const totalItems = count ?? 0
      return { items: (data ?? []).map(itemDesdeDb), totalItems, totalPages: Math.ceil(totalItems / porPagina) }
    },
    async buscarPorNombresYProveedor(nombres: string[], proveedor: string) {
      const encontrados = new Map<string, Item>()
      const nombresUnicos = [...new Set(nombres.map((name) => name.trim()).filter(Boolean))]
      for (let start = 0; start < nombresUnicos.length; start += 15) {
        for (const name of nombresUnicos.slice(start, start + 15)) {
          const result = await supabase.from('items').select('*')
            .ilike('supplier', `%${escaparLike(proveedor)}%`)
            .ilike('name', `%${escaparLike(name)}%`)
            .order('name')
          for (const row of errorResult(result)) {
            const item = itemDesdeDb(row)
            encontrados.set(item.id, item)
          }
        }
      }
      return [...encontrados.values()]
    },
    async contar(soloActivos = true) {
      let query = supabase.from('items').select('id', { count: 'exact', head: true })
      if (soloActivos) query = query.eq('active', true)
      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    },
    async crear(d: Omit<Item, 'id' | 'empresa'>) {
      const id = await empresaId()
      return itemDesdeDb(errorResult(await supabase.from('items')
        .insert({ ...itemAColumna(d), company_id: id }).select('*').single()))
    },
    async actualizar(id: string, d: Partial<Item>) {
      return itemDesdeDb(errorResult(await supabase.from('items').update(itemAColumna(d)).eq('id', id).select('*').single()))
    },
    async eliminar(id: string) {
      const { error } = await supabase.from('items').delete().eq('id', id)
      if (error) throw error
    },
  },

  usuarios: {
    async listar(): Promise<UsuarioEquipo[]> {
      const rows = errorResult(await supabase.from('profiles')
        .select('user_id,company_id,role,name,first_access_password_answered,created_at,email')
        .order('created_at'))
      return rows.map((r) => ({
        id: String(r.user_id),
        email: String(r.email ?? ''),
        name: String(r.name ?? ''),
        rol: String(r.role),
        primerAccesoClaveRespondido: Boolean(r.first_access_password_answered),
        empresa: String(r.company_id ?? ''),
        created: String(r.created_at ?? ''),
      }))
    },
    async crear(datos: { email: string; password: string; name: string; role?: string }) {
      const { error } = await supabase.functions.invoke('manage-team', {
        body: { action: 'create', ...datos },
      })
      if (error) throw error
    },
    async cambiarRol(id: string, role: string) {
      const { error } = await supabase.functions.invoke('manage-team', {
        body: { action: 'set-role', userId: id, role },
      })
      if (error) throw error
    },
    async eliminar(id: string) {
      const { error } = await supabase.functions.invoke('manage-team', { body: { action: 'delete', userId: id } })
      if (error) throw error
    },
    async restablecerClave(id: string, password: string) {
      const { error } = await supabase.functions.invoke('manage-team', {
        body: { action: 'reset-password', userId: id, password },
      })
      if (error) throw error
    },
  },

  roles: {
    async listar(): Promise<RolEmpresa[]> {
      return errorResult(await supabase.from('company_roles').select('id,name,permissions').order('name')).map(rolDesdeDb)
    },
    async crear(datos: { nombre: string; permisos: PermisoEmpresa[] }) {
      const id = await empresaId()
      return rolDesdeDb(errorResult(await supabase.from('company_roles')
        .insert({ company_id: id, name: datos.nombre.trim(), permissions: datos.permisos })
        .select('id,name,permissions').single()))
    },
    async actualizar(id: string, datos: { nombre: string; permisos: PermisoEmpresa[] }) {
      return rolDesdeDb(errorResult(await supabase.from('company_roles')
        .update({ name: datos.nombre.trim(), permissions: datos.permisos }).eq('id', id)
        .select('id,name,permissions').single()))
    },
    async eliminar(id: string) {
      const { error } = await supabase.from('company_roles').delete().eq('id', id)
      if (error) throw error
    },
  },

  clientes: {
    async listar() {
      return errorResult(await supabase.from('clients').select('*').order('name')).map(clienteDesdeDb)
    },
    async crear(d: Omit<Cliente, 'id' | 'empresa'>) {
      const id = await empresaId()
      return clienteDesdeDb(errorResult(await supabase.from('clients')
        .insert({ ...clienteAColumna(d), company_id: id }).select('*').single()))
    },
    async actualizar(id: string, d: Partial<Cliente>) {
      return clienteDesdeDb(errorResult(await supabase.from('clients')
        .update(clienteAColumna(d)).eq('id', id).select('*').single()))
    },
    async eliminar(id: string) {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
  },

  presupuestos: {
    async listar() {
      return errorResult(await supabase.from('quotes').select('*').order('number', { ascending: false })).map(presupuestoDesdeDb)
    },
    async obtener(id: string) {
      return presupuestoDesdeDb(errorResult(await supabase.from('quotes').select('*').eq('id', id).single()))
    },
    async crear(d: Partial<Presupuesto>) {
      const companyId = await empresaId()
      return presupuestoDesdeDb(errorResult(await supabase.from('quotes')
        .insert({ ...presupuestoAColumna(d), company_id: companyId, status: d.estado ?? 'borrador' })
        .select('*').single()))
    },
    async actualizar(id: string, d: Partial<Presupuesto>) {
      return presupuestoDesdeDb(errorResult(await supabase.from('quotes')
        .update(presupuestoAColumna(d)).eq('id', id).select('*').single()))
    },
    async cambiarEstado(id: string, estado: Estado) {
      return presupuestoDesdeDb(errorResult(await supabase.from('quotes')
        .update({ status: estado }).eq('id', id).select('*').single()))
    },
    async eliminar(id: string) {
      const { data, error } = await supabase.from('quotes').delete().eq('id', id).select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new Error('No se pudo eliminar: no tenés permiso sobre este presupuesto o ya no existe.')
    },
  },

  async perfil(user: User): Promise<{
    id: string
    email: string
    name: string
    empresa: string
    rol: string
    permisos: PermisoEmpresa[]
    primerAccesoClaveRespondido: boolean
  }> {
    const result = await supabase.from('profiles')
      .select('company_id,role,name,first_access_password_answered')
      .eq('user_id', user.id).single()
    const profile = errorResult(result)
    const owner = errorResult(await supabase.rpc('is_platform_owner'))
    let permisos: PermisoEmpresa[] = []
    if (!owner) {
      if (profile.role === 'admin') permisos = PERMISOS_EMPRESA.map(({ codigo }) => codigo)
      else if (profile.role === 'member') permisos = permisosMiembro
      else {
        const role = await supabase.from('company_roles').select('permissions')
          .eq('company_id', String(profile.company_id ?? '')).eq('id', String(profile.role)).maybeSingle()
        if (role.error) throw role.error
        if (!role.data) throw new Error('El rol de este usuario ya no existe. Pedile al administrador que lo asigne a otro.')
        permisos = Array.isArray(role.data.permissions)
          ? role.data.permissions.filter((value): value is PermisoEmpresa => PERMISOS_EMPRESA.some((p) => p.codigo === value))
          : []
        if (permisos.includes('quotes.create') && !permisos.includes('quotes.view_own')) {
          permisos = [...permisos, 'quotes.view_own']
        }
      }
    }
    return {
      id: user.id,
      email: user.email ?? '',
      name: String(profile.name ?? ''),
      empresa: profile.company_id ? String(profile.company_id) : '',
      rol: owner ? 'propietario' : String(profile.role),
      permisos,
      primerAccesoClaveRespondido: Boolean(profile.first_access_password_answered),
    }
  },

  /** Ventas por persona del equipo (sin borradores), de mayor a menor monto vendido (aceptado). */
  resumenPorVendedor(presupuestos: Presupuesto[]): ResumenVendedor[] {
    const personas = new Map<string, ResumenVendedor>()
    for (const p of presupuestos) {
      if (p.estado === 'borrador') continue
      const clave = p.vendedorEmail || ''
      const moneda = normalizarMoneda(p.moneda)
      const claveMoneda = `${clave}\u0000${moneda}`
      const v = personas.get(claveMoneda) ?? {
        clave, email: clave, nombre: p.vendedorNombre || (clave || 'Sin asignar'),
        cantidad: 0, aceptados: 0, presupuestado: 0, vendido: 0, rechazado: 0, pendiente: 0, conversionPct: 0,
        moneda,
      }
      v.cantidad++
      v.presupuestado += p.total
      if (p.estado === 'aceptado') { v.vendido += p.total; v.aceptados++ }
      if (p.estado === 'rechazado') v.rechazado += p.total
      if (p.estado === 'pendiente') v.pendiente += p.total
      personas.set(claveMoneda, v)
    }
    return [...personas.values()]
      .map((v) => ({ ...v, conversionPct: Math.round((1000 * v.aceptados) / v.cantidad) / 10 }))
      .sort((a, b) => Number(a.clave === '') - Number(b.clave === '') || b.vendido - a.vendido || b.presupuestado - a.presupuestado)
  },

  resumenMensual(presupuestos: Presupuesto[]): ResumenMes[] {
    const meses = new Map<string, ResumenMes & { aceptados: number }>()
    for (const p of presupuestos) {
      if (p.estado === 'borrador') continue
      const mes = (p.fechaEmision || p.created).slice(0, 7)
      const moneda = normalizarMoneda(p.moneda)
      const clave = `${mes}\u0000${moneda}`
      const m = meses.get(clave) ?? { mes, moneda, cantidad: 0, presupuestado: 0, aceptado: 0, rechazado: 0, pendiente: 0, ganancia: 0, conversionPct: 0, aceptados: 0, aceptadosCantidad: 0 }
      m.cantidad++
      m.presupuestado += p.total
      if (p.estado === 'aceptado') { m.aceptado += p.total; m.ganancia += Number(p.ganancia) || 0; m.aceptados++ }
      if (p.estado === 'rechazado') m.rechazado += p.total
      if (p.estado === 'pendiente') m.pendiente += p.total
      meses.set(clave, m)
    }
    return [...meses.values()]
      .map(({ aceptados, ...m }) => ({ ...m, aceptadosCantidad: aceptados, conversionPct: Math.round((1000 * aceptados) / m.cantidad) / 10 }))
      .sort((a, b) => b.mes.localeCompare(a.mes))
  },
}
