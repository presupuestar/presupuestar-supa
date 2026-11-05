import { Document, Page, View, Text, Image, Svg, Path, Rect, G, StyleSheet } from '@react-pdf/renderer'
import { fechaCorta, importeEnMoneda } from '../formato'
import { fechaVigencia, presupuestoCaducado } from '../estados'
import { LEYENDA_FISCAL } from '../legal'
import { requiereSena } from '../pagos'
import type { Empresa, Presupuesto } from '../tipos'

export interface LogoPng { src: string; ancho: number; alto: number }
export interface Fuentes { titulos: string; texto: string }

interface Props { presupuesto: Presupuesto; empresa: Empresa; logo?: LogoPng; fuentes: Fuentes }

const TINTA = '#101828', MUTED = '#5B6678', LINEA = '#E2E8F0', NIEBLA = '#F7F9FC'
const num4 = (n: number) => String(n).padStart(4, '0')
const cant = (n: number) => String(n).replace('.', ',')

/** Isotipo de PresupuestAR para el sello del pie. */
function Isotipo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={12} fill="#0B2545" />
      <G transform="translate(24 24) scale(1.14) translate(-25 -24.5)">
        <Path d="M14 9H28L36 17V23C36 27.4 32.6 31 28 31H23V40H14Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={1.4} />
        <Path d="M23 19H28C31 19 31 25 28 25H23Z" fill="#0B2545" />
        <Path d="M28 9V17H36Z" fill="#5BB5F0" stroke="#5BB5F0" strokeWidth={1} />
      </G>
    </Svg>
  )
}

export function PresupuestoPdf({ presupuesto: p, empresa: e, logo, fuentes }: Props) {
  const primario = e.colorPrimario, acento = e.colorAcento
  const s = StyleSheet.create({
    page: { paddingTop: 44, paddingBottom: 92, paddingHorizontal: 40, fontFamily: fuentes.texto, fontSize: 9.5, color: TINTA },
    barra: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: primario },
    cab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottomWidth: 0.75, borderBottomColor: LINEA },
    marca: { flexDirection: 'column', alignItems: 'flex-start', width: 160 },
    datosEmpresa: { marginTop: 6 },
    datosPresupuesto: { width: 160, alignItems: 'flex-end' },
    inicial: { width: 36, height: 36, borderRadius: 9, backgroundColor: primario, alignItems: 'center', justifyContent: 'center' },
    inicialTxt: { color: '#FFFFFF', fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 18 },
    nombre: { fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 14, color: primario },
    contacto: { fontSize: 7.5, color: MUTED, marginTop: 2 },
    titulo: { fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 21, color: primario, textAlign: 'right' },
    meta: { fontSize: 8.5, color: MUTED, textAlign: 'right', marginTop: 1 },
    borrador: { fontSize: 8, fontWeight: 700, color: '#7A5300', backgroundColor: '#FDF1D6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-end', marginTop: 4 },
    noFactura: { width: 145, minHeight: 78, borderWidth: 1.8, borderColor: '#344054', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 8, alignSelf: 'center' },
    noFacturaX: { fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 30, lineHeight: 1, color: '#344054', marginBottom: 9 },
    noFacturaTxt: { fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 8.5, lineHeight: 1.25, color: '#344054', textAlign: 'center' },
    cliente: { marginTop: 16, borderWidth: 0.75, borderColor: LINEA, borderRadius: 7, padding: 11 },
    clienteTit: { fontSize: 9, color: primario, marginBottom: 6 },
    clienteFila: { flexDirection: 'row', marginTop: 2 },
    etiqueta: { width: 105, fontSize: 8, color: MUTED },
    valor: { flex: 1, fontSize: 9.5, color: TINTA },
    materialNombre: { fontFamily: fuentes.titulos, fontWeight: 700 },
    th: { flexDirection: 'row', backgroundColor: primario, color: '#FFFFFF', paddingVertical: 6, paddingHorizontal: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5, fontWeight: 700, fontSize: 8.5 },
    fila: { flexDirection: 'row', paddingVertical: 5.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: LINEA },
    cDesc: { flex: 1, paddingRight: 8 },
    cDetalle: { fontSize: 8, color: MUTED, marginTop: 2, lineHeight: 1.05 },
    cCant: { width: 42, textAlign: 'right' },
    cUnit: { width: 86, textAlign: 'right' },
    cSub: { width: 90, textAlign: 'right' },
    cierre: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 },
    cond: { flex: 1 },
    condTit: { fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 9, color: TINTA, marginBottom: 3 },
    condTxt: { fontSize: 8.5, color: MUTED, lineHeight: 0.95 },
    total: { width: 210, borderTopWidth: 1.5, borderTopColor: primario, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalEt: { fontSize: 10, color: primario, fontWeight: 700 },
    totalVal: { fontFamily: fuentes.titulos, fontWeight: 700, fontSize: 15, color: primario },
    sena: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, fontSize: 8.5, color: MUTED },
    acentoLinea: { height: 2, width: 36, backgroundColor: acento, marginTop: 8 },
    pie: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTopWidth: 0.75, borderTopColor: LINEA, paddingTop: 6, fontSize: 7.5, color: MUTED },
    pieFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    leyenda: { marginTop: 3, fontSize: 6.5, lineHeight: 1.25, color: '#344054' },
    sello: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    contPag: { fontSize: 8, color: MUTED, marginBottom: 10 },
  })

  const CabeceraTabla = () => (
    <View style={s.th} wrap={false}>
      <Text style={s.cDesc}>Detalle</Text><Text style={s.cCant}>Cant.</Text><Text style={s.cUnit}>P. unitario</Text><Text style={s.cSub}>Importe</Text>
    </View>
  )

  const lineas = p.lineas ?? []
  const validez = p.validezDias ?? e.validezDias
  const vigenteHasta = fechaVigencia(p.fechaEmision, validez, p.vigenteHasta)
  const vencido = presupuestoCaducado(p, e.validezDias)
  const condiciones = e.condiciones || (validez ? `Validez del presupuesto: ${validez} días.` : '')
  const cl = p.clienteDatos ?? { nombre: '', email: '', telefono: '', documento: '', direccion: '' }

  return (
    <Document title={`Presupuesto N° ${num4(p.numero)}`} author={e.nombre} creator="PresupuestAR" producer="PresupuestAR">
      <Page size="A4" style={s.page}>
        <View fixed style={s.barra} />

        {/* A partir de la 2.ª hoja: referencia chica arriba y encabezado de la tabla repetido */}
        <View fixed render={({ pageNumber }) => pageNumber > 1 ? (
          <View>
            <Text style={s.contPag}>{e.nombre}  ·  Presupuesto N° {num4(p.numero)}  ·  continuación</Text>
            <CabeceraTabla />
          </View>
        ) : null} />

        <View style={s.cab}>
          <View style={s.marca}>
            {logo
              ? <Image src={logo.src} style={{ height: 34, width: Math.min(150, (34 * logo.ancho) / logo.alto) }} />
              : <View style={s.inicial}><Text style={s.inicialTxt}>{e.nombre.trim()[0]?.toUpperCase() ?? '?'}</Text></View>}
            <View style={s.datosEmpresa}>
              <Text style={s.nombre}>{e.nombre}</Text>
              {e.email && <Text style={s.contacto}>{e.email}</Text>}
              {e.telefono && <Text style={s.contacto}>{e.telefono}</Text>}
              {e.documento && <Text style={s.contacto}>CUIT {e.documento}</Text>}
            </View>
          </View>
          <View style={s.noFactura}>
            <Text style={s.noFacturaX}>X</Text>
            <Text style={s.noFacturaTxt}>NO VALIDO COMO FACTURA</Text>
          </View>
          <View style={s.datosPresupuesto}>
            <Text style={s.titulo}>PRESUPUESTO</Text>
            <Text style={s.meta}>N° {num4(p.numero)}</Text>
            <Text style={s.meta}>Fecha: {fechaCorta(p.fechaEmision)}</Text>
            {validez ? <Text style={s.meta}>Validez: {validez} días</Text> : null}
            {vigenteHasta ? <Text style={s.meta}>Vigente hasta: {fechaCorta(vigenteHasta)}</Text> : null}
            {p.plazo ? <Text style={s.meta}>Plazo: {p.plazo}</Text> : null}
            {p.estado === 'borrador' && <Text style={s.borrador}>BORRADOR</Text>}
            {vencido && <Text style={s.borrador}>CADUCADO</Text>}
          </View>
        </View>

        <View style={s.cliente} wrap={false}>
          <Text style={s.clienteTit}>Datos del cliente</Text>
          <View style={s.clienteFila}><Text style={s.etiqueta}>Nombre completo:</Text><Text style={s.valor}>{cl.nombre || '—'}</Text></View>
          <View style={s.clienteFila}><Text style={s.etiqueta}>DNI / CUIT / CUIL:</Text><Text style={s.valor}>{cl.documento || '—'}</Text></View>
          <View style={s.clienteFila}><Text style={s.etiqueta}>Dirección:</Text><Text style={s.valor}>{cl.direccion || '—'}</Text></View>
          <View style={s.clienteFila}><Text style={s.etiqueta}>Correo electrónico:</Text><Text style={s.valor}>{cl.email || '—'}</Text></View>
          <View style={s.clienteFila}><Text style={s.etiqueta}>Teléfono:</Text><Text style={s.valor}>{cl.telefono || '—'}</Text></View>
        </View>

        <View style={{ marginTop: 18 }}>
          <CabeceraTabla />
          {lineas.map((l, i) => (
            <View style={s.fila} key={i} wrap={false}>
              <View style={s.cDesc}>
                <Text style={s.materialNombre}>{l.descripcion}</Text>
                {l.detalle?.trim() ? <Text style={s.cDetalle}>{l.detalle}</Text> : null}
                {l.precioOrigen !== undefined && l.monedaOrigen ? <Text style={s.cDetalle}>Precio original: {importeEnMoneda(l.precioOrigen, l.monedaOrigen)}</Text> : null}
              </View>
              <Text style={s.cCant}>{cant(l.cantidad)}</Text>
              <Text style={s.cUnit}>{importeEnMoneda(l.precioUnitario, l.moneda ?? p.moneda)}</Text>
              <Text style={{ ...s.cSub, fontWeight: 700 }}>{importeEnMoneda(Math.round(l.cantidad * l.precioUnitario * 100) / 100, l.moneda ?? p.moneda)}</Text>
            </View>
          ))}
        </View>

        <View style={s.cierre} wrap={false}>
          <View style={s.cond}>
            {(p.formaPago || condiciones !== '') && <Text style={s.condTit}>Condiciones</Text>}
            {p.formaPago ? (
              <Text style={s.condTxt}><Text style={{ fontWeight: 700, color: TINTA }}>Forma de pago: </Text>{p.formaPago}</Text>
            ) : null}
            {p.cotizacionDolar ? <Text style={{ ...s.condTxt, marginTop: 4 }}>Tipo de cambio: {importeEnMoneda(p.cotizacionDolar, 'ARS')} por USD · fuente: {p.cotizacionFuente || 'dolarapi.com · dólar blue venta'} · {fechaCorta(p.cotizacionFecha || p.fechaEmision)}.</Text> : null}
            {condiciones !== '' && <Text style={{ ...s.condTxt, marginTop: p.formaPago ? 4 : 0 }}>{condiciones}</Text>}
            {p.notas ? (<><Text style={{ ...s.condTit, marginTop: 8 }}>Notas</Text><Text style={s.condTxt}>{p.notas}</Text></>) : null}
          </View>
          <View style={s.total}>
            <Text style={s.totalEt}>Total</Text>
            <Text style={s.totalVal}>{importeEnMoneda(p.total, p.moneda)}</Text>
          </View>
          {requiereSena(p.formaPago) && <View style={s.sena}>
            <Text>Seña del 50%</Text>
            <Text>{importeEnMoneda(Math.round(p.total * 50) / 100, p.moneda)}</Text>
          </View>}
        </View>

        <View fixed style={s.pie}>
          <View style={s.pieFila}>
            <Text>{[e.nombre, e.email].filter(Boolean).join('  ·  ')}</Text>
            {e.mostrarSello !== false && (
              <View style={s.sello}><Isotipo size={11} /><Text>Hecho con PresupuestAR</Text></View>
            )}
            <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          </View>
          <Text style={s.leyenda}>{LEYENDA_FISCAL}.</Text>
        </View>
      </Page>
    </Document>
  )
}
