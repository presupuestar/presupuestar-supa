export type ColorSegmento = 'aceptado' | 'rechazado' | 'pendiente'
  | 'vendedor-1' | 'vendedor-2' | 'vendedor-3' | 'vendedor-4'
  | 'vendedor-5' | 'vendedor-6' | 'vendedor-7' | 'vendedor-8'
  | 'mes-1' | 'mes-2' | 'mes-3' | 'mes-4' | 'mes-5' | 'mes-6'
  | 'mes-7' | 'mes-8' | 'mes-9' | 'mes-10' | 'mes-11' | 'mes-12'

type SegmentoCircular = {
  etiqueta: string
  valor: number
  importe: string
  color: ColorSegmento
}

const COLORES_CLAROS: ColorSegmento[] = [
  'pendiente', 'vendedor-3', 'mes-2', 'mes-5', 'mes-8', 'mes-11',
]

function puntoEnCirculo(grados: number, radio: number) {
  const radianes = (grados - 90) * Math.PI / 180
  return { x: 100 + radio * Math.cos(radianes), y: 100 + radio * Math.sin(radianes) }
}

export function GraficoCircular({ titulo, segmentos, total, detalle }: {
  titulo: string
  segmentos: SegmentoCircular[]
  total: string
  detalle?: { etiqueta: string; importe: string }
}) {
  const suma = segmentos.reduce((acumulado, segmento) => acumulado + Math.max(0, segmento.valor), 0)
  let grados = 0
  const porciones = suma ? segmentos.flatMap((segmento) => {
    const valor = Math.max(0, segmento.valor)
    if (!valor) return []
    const inicio = grados
    const porcentaje = valor / suma
    grados += porcentaje * 360
    const fin = grados
    const porcentajeRedondeado = Math.round(porcentaje * 100)
    const puntoInicio = puntoEnCirculo(inicio, 90)
    const puntoFin = puntoEnCirculo(fin, 90)
    const puntoEtiqueta = puntoEnCirculo((inicio + fin) / 2, 58)
    const camino = porcentaje >= 1
      ? ''
      : `M 100 100 L ${puntoInicio.x} ${puntoInicio.y} A 90 90 0 ${porcentaje > 0.5 ? 1 : 0} 1 ${puntoFin.x} ${puntoFin.y} Z`
    return [{
      segmento,
      porcentaje,
      porcentajeRedondeado,
      camino,
      puntoEtiqueta,
    }]
  }) : []

  return (
    <section className="grafico-circular">
      <header className="grafico-circular-encabezado">
        <h3>{titulo}</h3>
        <p><span>Total presupuestado</span><strong>{total}</strong></p>
      </header>
      <div className="grafico-circular-contenido">
        <svg
          className="grafico-circular-pie"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`${titulo}. ${segmentos.map((segmento) => {
            const porcentaje = suma ? Math.round(Math.max(0, segmento.valor) / suma * 100) : 0
            return `${segmento.etiqueta}: ${porcentaje}%, ${segmento.importe}`
          }).join('; ')}`}
        >
          {!suma && <circle cx="100" cy="100" r="90" fill="var(--linea)" />}
          {porciones.map(({ segmento, porcentaje, porcentajeRedondeado, camino, puntoEtiqueta }) => (
            <g key={segmento.etiqueta}>
              {porcentaje >= 1
                ? <circle cx="100" cy="100" r="90" fill={`var(--grafico-${segmento.color})`} stroke="white" strokeWidth="1.5" />
                : <path d={camino} fill={`var(--grafico-${segmento.color})`} stroke="white" strokeWidth="1.5" />}
              {porcentaje >= 0.07 && (
                <text
                  className={`grafico-circular-etiqueta ${COLORES_CLAROS.includes(segmento.color) ? 'oscura' : ''}`}
                  x={puntoEtiqueta.x}
                  y={puntoEtiqueta.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {porcentajeRedondeado}%
                </text>
              )}
            </g>
          ))}
          {!suma && <text className="grafico-circular-sin-datos" x="100" y="100" textAnchor="middle" dominantBaseline="central">Sin datos</text>}
        </svg>
        <ul className="grafico-circular-leyenda">
          {segmentos.map((segmento) => {
            const porcentaje = suma ? Math.round(Math.max(0, segmento.valor) / suma * 100) : 0
            return (
              <li key={segmento.etiqueta}>
                <span className={`grafico-circular-punto ${segmento.color}`} aria-hidden="true" />
                <span className="grafico-circular-nombre">{segmento.etiqueta}</span>
                <span className="grafico-circular-porcentaje">{porcentaje}%</span>
                <strong>{segmento.importe}</strong>
              </li>
            )
          })}
        </ul>
      </div>
      {detalle && <p className="grafico-circular-detalle"><span>{detalle.etiqueta}</span><strong>{detalle.importe}</strong></p>}
    </section>
  )
}
