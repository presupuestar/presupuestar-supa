/**
 * Única puerta de entrada a los datos. Las pantallas no hablan con PocketBase
 * directamente: si mañana cambia el backend, solo se reescribe este archivo.
 */
import { pb } from './pb'
import { normalizarMoneda } from './formato'
import type { Cliente, Empresa, Estado, Item, Linea, Presupuesto, ResumenMes, ResumenVendedor, UsuarioEquipo } from './tipos'

/** Empresa del usuario con sesión iniciada: todo lo que se crea queda dentro de ella. */
const empresaId = (): string => {
  const id = pb.authStore.record?.empresa as string | undefined
  if (!id) throw new Error('Este usuario no tiene una empresa asignada.')
  return id
}

const dinero = (n: number) => Math.round(n * 100) / 100

const escaparFiltro = (valor: string) => valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export const totalLineas = (lineas: Linea[]) =>
  dinero(lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0))

export const repositorio = {
  empresa: {
    obtener: (): Promise<Empresa> => pb.collection<Empresa>('empresa').getOne(empresaId()),
    archivoUrl(e: Empresa, archivo?: string) {
      return archivo ? pb.files.getURL(e, archivo) : undefined
    },
    actualizar: (id: string, datos: FormData | Partial<Empresa>) =>
      pb.collection<Empresa>('empresa').update(id, datos),
  },

  items: {
    listar: (soloActivos = true) =>
      pb.collection<Item>('items').getFullList({ sort: 'nombre', filter: soloActivos ? 'activo = true' : '' }),
    listarPagina: async ({
      pagina, porPagina, soloActivos, busqueda, proveedor, sinProveedor,
    }: {
      pagina: number
      porPagina: number
      soloActivos: boolean
      busqueda?: string
      proveedor?: string
      sinProveedor?: boolean
    }) => {
      const filtros = soloActivos ? ['activo = true'] : []
      const consulta = busqueda?.trim()
      if (consulta) {
        const valor = escaparFiltro(consulta)
        filtros.push(`(nombre ~ "${valor}" || descripcion ~ "${valor}" || proveedor ~ "${valor}")`)
      }
      if (sinProveedor) filtros.push('proveedor = ""')
      else if (proveedor?.trim()) filtros.push(`proveedor ~ "${escaparFiltro(proveedor.trim())}"`)
      const resultado = await pb.collection<Item>('items').getList(pagina, porPagina, {
        sort: 'nombre',
        filter: filtros.join(' && '),
      })
      return {
        items: resultado.items,
        totalItems: resultado.totalItems,
        totalPages: resultado.totalPages,
      }
    },
    buscarPorNombresYProveedor: async (nombres: string[], proveedor: string) => {
      const encontrados = new Map<string, Item>()
      const nombresUnicos = [...new Set(nombres.map((nombre) => nombre.trim()).filter(Boolean))]
      for (let inicio = 0; inicio < nombresUnicos.length; inicio += 15) {
        const filtrosNombre = nombresUnicos.slice(inicio, inicio + 15)
          .map((nombre) => `nombre ~ "${escaparFiltro(nombre)}"`)
          .join(' || ')
        let pagina = 1
        let totalPaginas = 1
        while (pagina <= totalPaginas) {
          const resultado = await pb.collection<Item>('items').getList(pagina, 30, {
            sort: 'nombre',
            filter: `proveedor ~ "${escaparFiltro(proveedor)}" && (${filtrosNombre})`,
          })
          for (const item of resultado.items) encontrados.set(item.id, item)
          totalPaginas = resultado.totalPages
          pagina++
        }
      }
      return [...encontrados.values()]
    },
    contar: async (soloActivos = true) => {
      const resultado = await pb.collection<Item>('items').getList(1, 1, {
        filter: soloActivos ? 'activo = true' : '',
      })
      return resultado.totalItems
    },
    crear: (d: Omit<Item, 'id' | 'empresa'>) => pb.collection<Item>('items').create({ ...d, empresa: empresaId() }),
    actualizar: (id: string, d: Partial<Item>) => pb.collection<Item>('items').update(id, d),
    eliminar: (id: string) => pb.collection('items').delete(id),
  },

  /** Equipo de la empresa: el administrador crea empleados (rol "miembro") y gestiona sus accesos. */
  usuarios: {
    listar: () => pb.collection<UsuarioEquipo>('users').getFullList({ sort: 'created' }),
    crear: (d: { email: string; password: string; name: string }) =>
      pb.collection<UsuarioEquipo>('users').create({ ...d, passwordConfirm: d.password, empresa: empresaId(), rol: 'miembro', emailVisibility: true }),
    eliminar: (id: string) => pb.collection('users').delete(id),
    restablecerClave: (id: string, password: string) => pb.send(`/api/equipo/${id}/clave`, { method: 'POST', body: { password } }),
  },

  clientes: {
    listar: () => pb.collection<Cliente>('clientes').getFullList({ sort: 'nombre' }),
    crear: (d: Omit<Cliente, 'id' | 'empresa'>) => pb.collection<Cliente>('clientes').create({ ...d, empresa: empresaId() }),
    actualizar: (id: string, d: Partial<Cliente>) => pb.collection<Cliente>('clientes').update(id, d),
  },

  presupuestos: {
    listar: () => pb.collection<Presupuesto>('presupuestos').getFullList({ sort: '-numero' }),
    obtener: (id: string) => pb.collection<Presupuesto>('presupuestos').getOne(id),
    // El número y el total los asigna el servidor (hook de PocketBase).
    crear: (d: Partial<Presupuesto>) => pb.collection<Presupuesto>('presupuestos').create({ ...d, empresa: empresaId() }),
    actualizar: (id: string, d: Partial<Presupuesto>) => pb.collection<Presupuesto>('presupuestos').update(id, d),
    cambiarEstado: (id: string, estado: Estado) =>
      pb.collection<Presupuesto>('presupuestos').update(id, { estado }),
    eliminar: (id: string) => pb.collection('presupuestos').delete(id),
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
      // las personas ordenadas por lo vendido; los presupuestos sin vendedor asignado (anteriores a esta función) van al final
      .sort((a, b) => Number(a.clave === '') - Number(b.clave === '') || b.vendido - a.vendido || b.presupuestado - a.presupuestado)
  },

  /** Resumen por mes de emisión. Conversión = aceptados / enviados (sin borradores). */
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
