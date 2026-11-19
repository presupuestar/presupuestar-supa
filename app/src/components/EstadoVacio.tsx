import type { ReactNode } from 'react'

type Icono = 'graficos' | 'lista' | 'personas' | 'catalogo' | 'busqueda'

/** Tarjeta para pantallas sin datos: ícono, qué pasa y qué hacer. */
export function EstadoVacio({ icono = 'lista', titulo, children, acciones }: {
  icono?: Icono
  titulo: string
  children?: ReactNode
  acciones?: ReactNode
}) {
  return (
    <section className="inicio-vacio estado-vacio">
      <span className={`inicio-vacio-icono icono-${icono}`} aria-hidden="true" />
      <div>
        <h2>{titulo}</h2>
        {children && <p>{children}</p>}
        {acciones && <div className="botones izq">{acciones}</div>}
      </div>
    </section>
  )
}

/** Silueta gris mientras cargan los datos, con la forma aproximada del contenido. */
export function Silueta({ alto = 14, ancho = '100%', redondeo = 7 }: { alto?: number; ancho?: number | string; redondeo?: number }) {
  return <span className="silueta" style={{ height: alto, width: ancho, borderRadius: redondeo }} aria-hidden="true" />
}

/** Filas de carga para una tabla (también se ven bien como tarjetas en el celular). */
export function CargandoFilas({ columnas, filas = 4 }: { columnas: number; filas?: number }) {
  return (
    <tr className="fila-vacia fila-cargando" aria-busy="true">
      <td colSpan={columnas}>
        <span className="sr">Cargando…</span>
        {Array.from({ length: filas }, (_, i) => (
          <span className="fila-cargando-linea" key={i}>
            <Silueta ancho={`${38 - (i % 3) * 6}%`} />
            <Silueta ancho="22%" />
            <Silueta ancho="14%" />
          </span>
        ))}
      </td>
    </tr>
  )
}
