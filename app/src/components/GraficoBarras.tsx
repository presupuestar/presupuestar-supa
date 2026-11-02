import type { ColorSegmento } from './GraficoCircular'

export interface DatoGraficoBarras {
  clave: string
  etiqueta: string
  valor: number
  valorTexto: string
  color: ColorSegmento
}

export function GraficoBarras({
  titulo,
  datos,
  seleccionado,
  alSeleccionar,
}: {
  titulo: string
  datos: DatoGraficoBarras[]
  seleccionado?: string | null
  alSeleccionar?: (clave: string) => void
}) {
  const maximo = Math.max(0, ...datos.map((dato) => dato.valor))

  return (
    <section className="grafico-barras">
      <h3>{titulo}</h3>
      {datos.length === 0 ? (
        <p className="grafico-barras-vacio">Sin datos para comparar.</p>
      ) : (
        <ol className="grafico-barras-lista">
          {datos.map((dato) => {
            const ancho = maximo ? Math.max(0, dato.valor) / maximo * 100 : 0
            const contenido = (
              <>
                <span className="grafico-barras-etiqueta">{dato.etiqueta}</span>
                <span className="grafico-barras-riel" aria-hidden="true">
                  <span className="grafico-barras-relleno" style={{ width: `${ancho}%`, backgroundColor: `var(--grafico-${dato.color})` }} />
                </span>
                <strong className="grafico-barras-valor">{dato.valorTexto}</strong>
              </>
            )

            return (
              <li key={dato.clave}>
                {alSeleccionar ? (
                  <button
                    type="button"
                    className="grafico-barras-fila seleccionable"
                    aria-label={`${dato.etiqueta}: ${dato.valorTexto}. Filtrar`}
                    aria-pressed={seleccionado === dato.clave}
                    onClick={() => alSeleccionar(dato.clave)}
                  >
                    {contenido}
                  </button>
                ) : (
                  <div className="grafico-barras-fila">{contenido}</div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
