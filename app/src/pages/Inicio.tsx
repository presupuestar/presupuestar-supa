import { Silueta } from '../components/EstadoVacio'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tienePermiso, useSesion } from '../context/Sesion'
import { Layout } from '../components/Layout'
import { GraficoCircular, type ColorSegmento } from '../components/GraficoCircular'
import { GraficoBarras } from '../components/GraficoBarras'
import { importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { mensajeError } from '../lib/errores'
import { presupuestoCaducado } from '../lib/estados'
import { repositorio } from '../lib/repositorio'
import type { ResumenMes } from '../lib/tipos'

const nombreMes = (aaaamm: string) =>
  new Date(aaaamm + '-15').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

export function Inicio() {
  const { empresa, usuario } = useSesion()
  const [meses, setMeses] = useState<ResumenMes[]>([])
  const [caducados, setCaducados] = useState(0)
  const [borradores, setBorradores] = useState(0)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState('')
  const puedeVer = tienePermiso(usuario, 'quotes.view_own') || tienePermiso(usuario, 'quotes.view_all')

  useEffect(() => {
    if (tienePermiso(usuario, 'quotes.view_own') || tienePermiso(usuario, 'quotes.view_all')) {
      repositorio.presupuestos.listar()
        .then((l) => {
          setMeses(repositorio.resumenMensual(l))
          setCaducados(l.filter((p) => presupuestoCaducado(p, empresa?.validezDias)).length)
          setBorradores(l.filter((p) => p.estado === 'borrador').length)
          setCargado(true)
        })
        .catch((e) => setError(mensajeError(e, 'No se pudo cargar el resumen de presupuestos.')))
    }
  }, [usuario, empresa?.validezDias])

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
        {caducados > 0 && (
          <p className="aviso-vigencia" role="alert">
            {caducados === 1 ? 'Hay 1 presupuesto pendiente que superó su fecha de vigencia.' : `Hay ${caducados} presupuestos pendientes que superaron su fecha de vigencia.`}
            {' '}<Link className="link" to="/historial">Revisarlos en el historial</Link>
          </p>
        )}

        {!cargado && puedeVer && !error && (
          <section className="resumen" aria-busy="true">
            <span className="sr">Cargando el resumen…</span>
            <Silueta alto={24} ancho={260} />
            <div className="resumen-mes">
              <div className="grafico-circular silueta-tarjeta"><Silueta alto={18} ancho="55%" /><div className="silueta-torta"><Silueta alto={150} ancho={150} redondeo={999} /><span><Silueta /><Silueta ancho="80%" /><Silueta ancho="65%" /></span></div></div>
            </div>
            <div className="graficos-barras"><div className="grafico-barras silueta-tarjeta"><Silueta alto={18} ancho="40%" /><Silueta alto={14} /><Silueta alto={14} ancho="70%" /></div></div>
          </section>
        )}

        {cargado && !mes && puedeVer && (
          <section className="inicio-vacio">
            <span className="inicio-vacio-icono" aria-hidden="true" />
            <div>
              <h2>{tienePermiso(usuario, 'quotes.view_all') ? 'Todavía no hay presupuestos emitidos' : 'Todavía no emitiste presupuestos'}</h2>
              <p>
                {borradores > 0
                  ? `Tenés ${borradores === 1 ? '1 borrador guardado' : `${borradores} borradores guardados`}. Los borradores no cuentan en el resumen: cuando ${borradores === 1 ? 'lo emitas' : 'los emitas'}, acá vas a ver el panorama del mes.`
                  : 'Cuando emitas el primero, acá vas a ver el panorama del mes: cuánto presupuestaste, qué se aceptó y qué sigue pendiente.'}
              </p>
              {borradores > 0 && <div className="botones izq">
                <Link className="btn sec chico" to="/historial">Ver {borradores === 1 ? 'el borrador' : 'los borradores'}</Link>
              </div>}
            </div>
          </section>
        )}

        {mes && puedeVer && (
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
