import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tienePermiso, useSesion } from '../context/Sesion'
import { Layout } from '../components/Layout'
import { GraficoCircular, type ColorSegmento } from '../components/GraficoCircular'
import { GraficoBarras } from '../components/GraficoBarras'
import { importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { mensajeError } from '../lib/errores'
import { repositorio } from '../lib/repositorio'
import type { ResumenMes } from '../lib/tipos'

const nombreMes = (aaaamm: string) =>
  new Date(aaaamm + '-15').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

export function Inicio() {
  const { empresa, usuario } = useSesion()
  const [meses, setMeses] = useState<ResumenMes[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (tienePermiso(usuario, 'quotes.view_own') || tienePermiso(usuario, 'quotes.view_all')) {
      repositorio.presupuestos.listar()
        .then((l) => setMeses(repositorio.resumenMensual(l)))
        .catch((e) => setError(mensajeError(e, 'No se pudo cargar el resumen de presupuestos.')))
    }
  }, [usuario])

  const mes = meses[0]
  const resumenMes = mes ? meses.filter((m) => m.mes === mes.mes) : []
  const monedas = [...new Set(meses.map((m) => normalizarMoneda(m.moneda)))]
  const tendencias = monedas.map((moneda) => ({
    moneda,
    datos: meses
      .filter((m) => normalizarMoneda(m.moneda) === moneda)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12)
      .map((m) => ({
        clave: m.mes,
        etiqueta: nombreMes(m.mes),
        valor: m.presupuestado,
        valorTexto: importeEnMoneda(m.presupuestado, m.moneda),
        color: `mes-${Number(m.mes.slice(5, 7))}` as ColorSegmento,
      })),
  }))

  return (
    <Layout>
      <main className="contenido inicio">
        {error && <p className="error" role="alert">{error}</p>}
        <div className="encabezado">
          <div>
            <h1>Hola{empresa ? `, ${empresa.nombre}` : ''}</h1>
            <p className="sub">{tienePermiso(usuario, 'quotes.view_all') ? 'Presupuestos de la empresa.' : 'Tus presupuestos.'}</p>
          </div>
          {tienePermiso(usuario, 'quotes.create') && <Link className="btn chico" to="/nuevo">Nuevo presupuesto</Link>}
        </div>

        {mes && (tienePermiso(usuario, 'quotes.view_own') || tienePermiso(usuario, 'quotes.view_all')) && (
          <section className="resumen">
            <div className="encabezado"><h2>Panorama de {nombreMes(mes.mes)}</h2><Link className="link" to="/historial">Ver historial</Link></div>
            <div className="resumen-mes">
              {resumenMes.map((m) => (
                <GraficoCircular
                  key={m.moneda}
                  titulo={`Estado de presupuestos · ${normalizarMoneda(m.moneda)}`}
                  total={importeEnMoneda(m.presupuestado, m.moneda)}
                  detalle={{ etiqueta: 'Ganancia de aceptados', importe: importeEnMoneda(m.ganancia, m.moneda) }}
                  segmentos={[
                    { etiqueta: 'Aceptado', valor: m.aceptado, importe: importeEnMoneda(m.aceptado, m.moneda), color: 'aceptado' },
                    { etiqueta: 'Pendiente', valor: m.pendiente, importe: importeEnMoneda(m.pendiente, m.moneda), color: 'pendiente' },
                    { etiqueta: 'Rechazado', valor: m.rechazado, importe: importeEnMoneda(m.rechazado, m.moneda), color: 'rechazado' },
                  ]}
                />
              ))}
            </div>
            <div className="graficos-barras">
              {tendencias.map((tendencia) => <GraficoBarras key={tendencia.moneda} titulo={`Evolución mensual · ${tendencia.moneda}`} datos={tendencia.datos} />)}
            </div>
          </section>
        )}
      </main>
    </Layout>
  )
}
