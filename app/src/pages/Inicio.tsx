import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '../context/Sesion'
import { Layout } from '../components/Layout'
import { importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { repositorio } from '../lib/repositorio'
import type { ResumenMes } from '../lib/tipos'

const nombreMes = (aaaamm: string) =>
  new Date(aaaamm + '-15').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

export function Inicio() {
  const { empresa, usuario } = useSesion()
  const [items, setItems] = useState<number | null>(null)
  const [presupuestos, setPresupuestos] = useState<number | null>(null)
  const [meses, setMeses] = useState<ResumenMes[]>([])

  useEffect(() => {
    repositorio.items.contar().then(setItems)
    repositorio.presupuestos.listar().then((l) => { setPresupuestos(l.length); setMeses(repositorio.resumenMensual(l)) })
  }, [])

  const mes = meses[0]
  const resumenMes = mes ? meses.filter((m) => m.mes === mes.mes) : []
  const emitidosMes = resumenMes.reduce((total, m) => total + m.cantidad, 0)
  const aceptadosMes = resumenMes.reduce((total, m) => total + m.aceptadosCantidad, 0)
  const conversionMes = emitidosMes ? Math.round((1000 * aceptadosMes) / emitidosMes) / 10 : 0

  return (
    <Layout>
      <main className="contenido inicio">
        <div className="encabezado">
          <div>
            <h1>Hola{empresa ? `, ${empresa.nombre}` : ''}</h1>
            <p className="sub">{usuario?.rol === 'admin' ? 'Un resumen de toda la empresa.' : 'Un resumen de los presupuestos que hiciste vos.'}</p>
          </div>
          <Link className="btn chico" to="/nuevo">Nuevo presupuesto</Link>
        </div>

        <div className="tarjetas">
          <article><span>Ítems en el catálogo</span><strong>{items ?? '…'}</strong></article>
          <article><span>Presupuestos guardados</span><strong>{presupuestos ?? '…'}</strong></article>
          <article><span>Conversión {mes ? `(${nombreMes(mes.mes)})` : ''}</span><strong>{mes ? `${conversionMes}%` : '—'}</strong></article>
        </div>

        {mes && (
          <section className="resumen">
            <div className="encabezado"><h2>Resumen de {nombreMes(mes.mes)}</h2><Link className="link" to="/historial">Ver historial completo</Link></div>
            {resumenMes.map((m) => (
              <dl key={m.moneda}>
                <div><dt>Moneda</dt><dd>{normalizarMoneda(m.moneda)}</dd></div>
                <div><dt>Presupuestado</dt><dd>{importeEnMoneda(m.presupuestado, m.moneda)}</dd></div>
                <div><dt>Aceptado</dt><dd className="ok">{importeEnMoneda(m.aceptado, m.moneda)}</dd></div>
                <div><dt>Ganancia mensual</dt><dd className="ok">{importeEnMoneda(m.ganancia, m.moneda)}</dd></div>
                <div><dt>Rechazado</dt><dd className="no">{importeEnMoneda(m.rechazado, m.moneda)}</dd></div>
                <div><dt>Pendiente</dt><dd className="pe">{importeEnMoneda(m.pendiente, m.moneda)}</dd></div>
              </dl>
            ))}
          </section>
        )}
      </main>
    </Layout>
  )
}
