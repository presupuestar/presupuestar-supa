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
import type { Presupuesto, ResumenMes } from '../lib/tipos'
import { ETIQUETA, sePuedeEditar } from '../lib/estados'
import { Importe } from '../components/Importe'
import { Iniciales } from '../components/Iniciales'
import { haceCuanto } from '../lib/tiempo'

/** Mes corto para las barras: «nov 2026». */
const mesCorto = (aaaamm: string) => new Date(aaaamm + '-15').toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', ' ')
const nombreMes = (aaaamm: string) =>
  new Date(aaaamm + '-15').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

/** Saludo según la hora del día, como lo diría una persona. */
const saludo = (hora: number) => hora >= 5 && hora < 13 ? 'Buen día' : hora >= 13 && hora < 20 ? 'Buenas tardes' : 'Buenas noches'

const nombreVisible = (nombre?: string) => {
  const limpio = (nombre ?? '').trim()
  if (!limpio || limpio.includes('@')) return ''
  return limpio.split(/\s+/)[0]
}

export function Inicio() {
  const { empresa, usuario } = useSesion()
  const [meses, setMeses] = useState<ResumenMes[]>([])
  const [caducados, setCaducados] = useState(0)
  const [borradores, setBorradores] = useState(0)
  const [esperando, setEsperando] = useState(0)
  const [ultimos, setUltimos] = useState<Presupuesto[]>([])
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
          setUltimos([...l].sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created)).slice(0, 5))
          setEsperando(l.filter((p) => p.estado === 'pendiente' && !presupuestoCaducado(p, empresa?.validezDias)).length)
          setCargado(true)
        })
        .catch((e) => setError(mensajeError(e, 'No se pudo cargar el resumen de presupuestos.')))
    }
  }, [usuario, empresa?.validezDias])

  const mes = meses[0]
  // El vendedor solo aporta si hay más de uno.
  const variosVendedores = new Set(ultimos.map((p) => p.vendedor)).size > 1
  const ahora = new Date()
  const fechaHoy = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const nombre = nombreVisible(usuario?.name)
  const subtitulo = cargado && esperando > 0
    ? (esperando === 1 ? 'Tenés 1 presupuesto esperando respuesta del cliente.' : `Tenés ${esperando} presupuestos esperando respuesta de los clientes.`)
    : tienePermiso(usuario, 'quotes.view_all') ? `Así vienen los presupuestos de ${empresa?.nombre ?? 'la empresa'}.` : 'Así vienen tus presupuestos.'
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
        etiqueta: mesCorto(m.mes),
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
            <p className="antetitulo">{fechaHoy}</p>
            <h1>{saludo(ahora.getHours())}{nombre ? `, ${nombre}` : ''}</h1>
            <p className="sub">{subtitulo}</p>
          </div>
          {tienePermiso(usuario, 'quotes.create') && <Link className="btn chico" to="/nuevo">Nuevo presupuesto</Link>}
        </div>
        {caducados > 0 && (
          <p className="aviso-vigencia" role="alert">
            {caducados === 1 ? 'Hay 1 presupuesto pendiente que superó su fecha de vigencia.' : `Hay ${caducados} presupuestos pendientes que superaron su fecha de vigencia.`}
            {' '}<Link className="link" to="/historial?estado=caducado">{caducados === 1 ? 'Revisarlo en el historial' : 'Revisarlos en el historial'}</Link>
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
            {/* Las cifras que importan, primero y en grande; los gráficos las explican debajo. */}
            {resumenMes.map((m) => (
              <dl className="kpis" key={`kpis-${m.moneda}`} aria-label={`Resumen del mes en ${normalizarMoneda(m.moneda)}`}>
                <div className="kpi principal">
                  <dt>Presupuestado</dt>
                  <dd><Importe valor={m.presupuestado} moneda={m.moneda} /></dd>
                  <small>{m.cantidad === 1 ? '1 presupuesto emitido' : `${m.cantidad} presupuestos emitidos`}</small>
                </div>
                <div className="kpi aceptado">
                  <dt>Aceptado</dt>
                  <dd><Importe valor={m.aceptado} moneda={m.moneda} /></dd>
                  <small>{m.conversionPct.toLocaleString('es-AR')} % de aceptación</small>
                </div>
                <div className="kpi pendiente">
                  <dt>Pendiente</dt>
                  <dd><Importe valor={m.pendiente} moneda={m.moneda} /></dd>
                  <small>Esperando respuesta</small>
                </div>
                <div className="kpi ganancia">
                  <dt>Ganancia</dt>
                  <dd><Importe valor={m.ganancia} moneda={m.moneda} /></dd>
                  <small>De lo aceptado</small>
                </div>
              </dl>
            ))}
            <div className="resumen-mes">
              {resumenMes.map((m) => (
                <GraficoCircular
                  key={m.moneda}
                  titulo={`Estado de presupuestos · ${normalizarMoneda(m.moneda)}`}
                  total={importeEnMoneda(m.presupuestado, m.moneda)}
                  sinTotales
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

        {cargado && ultimos.length > 0 && (
          <section className="ultimos">
            <div className="encabezado"><h2>Lo último</h2><Link className="link" to="/historial">Ver todos</Link></div>
            <ul className="ultimos-lista">
              {ultimos.map((p) => {
                const cliente = p.clienteDatos?.nombre || 'Sin cliente'
                const destino = sePuedeEditar(p.estado) && tienePermiso(usuario, 'quotes.update_own') && (usuario?.rol === 'admin' || p.vendedor === usuario?.id) ? `/presupuestos/${p.id}/editar` : '/historial'
                const caducado = presupuestoCaducado(p, empresa?.validezDias)
                return (
                  <li key={p.id}>
                    <Link to={destino} className="ultimos-fila">
                      <Iniciales nombre={cliente} />
                      <span className="ultimos-cliente">
                        <strong>{cliente}</strong>
                        <small>N° {String(p.numero).padStart(4, '0')} · {p.estado === 'borrador' ? 'editado ' : ''}{haceCuanto(p.estado === 'borrador' ? (p.updated || p.created) : (p.fechaEmision || p.created))}{variosVendedores && p.vendedorNombre ? ` · ${p.vendedorNombre}` : ''}</small>
                      </span>
                      <span className="ultimos-total"><Importe valor={p.total} moneda={p.moneda} /></span>
                      <span className={`estado-punto ${caducado ? 'caducado' : p.estado}`}>{caducado ? 'Caducado' : ETIQUETA[p.estado]}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
    </Layout>
  )
}
