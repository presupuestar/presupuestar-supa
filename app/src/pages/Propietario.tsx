import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { pbAdmin } from '../lib/pbAdmin'
import { fechaCorta, importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { mensajeError } from '../lib/errores'
import { ETIQUETA } from '../lib/estados'
import { generarClave } from '../lib/clave'
import { repositorio } from '../lib/repositorio'
import { generarPdf, nombreArchivo } from '../lib/pdf/generar'
import { Isotipo } from '../components/Isotipo'
import { ClaveDialog } from '../components/ClaveDialog'
import { useSesion } from '../context/Sesion'
import type { Cliente, Empresa, Item, Presupuesto, UsuarioEquipo } from '../lib/tipos'

/** Panel del propietario: solo con el superusuario. Muestra todas las empresas y, al entrar a una, todos sus datos. */

const idSeguro = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '')
const filtroEmpresa = (id: string) => `empresa="${idSeguro(id)}"`
const esPropietario = () => pbAdmin.authStore.isValid && pbAdmin.authStore.isSuperuser
const coleccionesEmpresa = ['presupuestos', 'clientes', 'items', 'users'] as const
type ConteosEmpresa = Pick<FilaEmpresa, 'usuarios' | 'clientes' | 'items' | 'presupuestos'>

const contarDatosEmpresa = async (id: string): Promise<ConteosEmpresa> => {
  const contar = (coleccion: string) => pbAdmin.collection(coleccion)
    .getList(1, 1, { filter: filtroEmpresa(id), fields: 'id' })
    .then((pagina) => pagina.totalItems)
  const [presupuestos, clientes, items, usuarios] = await Promise.all([
    contar('presupuestos'), contar('clientes'), contar('items'), contar('users'),
  ])
  return { usuarios, clientes, items, presupuestos }
}

const borrarDatosEmpresa = async (coleccion: typeof coleccionesEmpresa[number], id: string, alBorrar: () => void) => {
  let total = 0
  while (true) {
    const pagina = await pbAdmin.collection(coleccion).getList(1, 100, { filter: filtroEmpresa(id), fields: 'id' })
    if (!pagina.items.length) return total
    for (const registro of pagina.items) {
      await pbAdmin.collection(coleccion).delete(registro.id)
      total++
      alBorrar()
    }
  }
}

export function Propietario() {
  const { empresa: empresaSesion } = useSesion()
  const [dentro, setDentro] = useState(esPropietario())
  const [verificando, setVerificando] = useState(pbAdmin.authStore.isValid)
  const { id } = useParams()

  useEffect(() => {
    const tituloAnterior = document.title
    document.title = 'PresupuestAR · Propietario'
    return () => { document.title = empresaSesion?.nombre ?? tituloAnterior }
  }, [empresaSesion?.nombre])

  useEffect(() => {
    if (!pbAdmin.authStore.isValid) { setVerificando(false); return }
    pbAdmin.collection('_superusers').authRefresh()
      .then(() => setDentro(true))
      .catch(() => { pbAdmin.authStore.clear(); setDentro(false) })
      .finally(() => setVerificando(false))
  }, [])
  useEffect(() => pbAdmin.authStore.onChange(() => setDentro(esPropietario())), [])

  if (verificando) return null
  if (!dentro) return <IngresoPropietario />

  return (
    <div className="app panel-propietario">
      <header className="barra">
        <span className="marca"><Isotipo size={32} /><strong>PresupuestAR · Propietario</strong></span>
        <nav aria-label="Propietario"><Link to="/propietario" className={!id ? 'activo' : ''}>Empresas</Link></nav>
        <span className="usuario">{pbAdmin.authStore.record?.email as string} <button className="link" onClick={() => pbAdmin.authStore.clear()}>Salir</button></span>
      </header>
      {id ? <DetalleEmpresa key={id} id={id} /> : <ListaEmpresas />}
    </div>
  )
}

function IngresoPropietario() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault(); setError(''); setEnviando(true)
    try { await pbAdmin.collection('_superusers').authWithPassword(email, clave) }
    catch { setError('Correo o contraseña de superusuario incorrectos.') }
    finally { setEnviando(false) }
  }
  return (
    <main className="login panel-propietario">
      <section className="login-lado">
        <span className="marca"><Isotipo size={44} /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
        <h1>Panel del propietario</h1>
        <p>Acceso exclusivo con el superusuario. Desde acá ves todas las empresas y sus datos.</p>
      </section>
      <section className="login-form">
        <form onSubmit={enviar}>
          <h2>Ingresá como superusuario</h2>
          <label>Correo electrónico<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>Contraseña<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------- lista de empresas
interface FilaEmpresa { empresa: Empresa; usuarios: number; clientes: number; items: number; presupuestos: number }

function ListaEmpresas() {
  const [filas, setFilas] = useState<FilaEmpresa[] | null>(null)
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  const [eliminando, setEliminando] = useState<FilaEmpresa | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState('')
  const [progresoBorrado, setProgresoBorrado] = useState(0)

  const cargar = async () => {
    try {
      const empresas = await pbAdmin.collection<Empresa>('empresa').getFullList({ sort: 'nombre' })
      setFilas(await Promise.all(empresas.map(async (e) => {
        const conteos = await contarDatosEmpresa(e.id)
        return { empresa: e, ...conteos }
      })))
    } catch (e) { setFilas([]); setError(mensajeError(e, 'No se pudieron cargar las empresas.')) }
  }
  useEffect(() => { cargar() }, [])

  const borrar = async () => {
    if (!eliminando) return
    setBorrando(true); setErrorBorrado(''); setProgresoBorrado(0)
    let progreso = 0
    try {
      const actual = await pbAdmin.collection<Empresa>('empresa').getOne(eliminando.empresa.id)
      if (actual.nombre !== eliminando.empresa.nombre) throw new Error('La empresa cambió desde que abriste la confirmación. No se borró nada.')
      const conteosActuales = await contarDatosEmpresa(actual.id)
      const cambiaronConteos = Object.keys(conteosActuales).some((campo) =>
        conteosActuales[campo as keyof ConteosEmpresa] !== eliminando[campo as keyof ConteosEmpresa])
      if (cambiaronConteos) {
        setEliminando({ empresa: actual, ...conteosActuales })
        setErrorBorrado('Los datos cambiaron desde que abriste la confirmación. Revisá las cantidades actualizadas y volvé a confirmar.')
        return
      }
      for (const coleccion of coleccionesEmpresa) {
        await borrarDatosEmpresa(coleccion, actual.id, () => {
          progreso++
          setProgresoBorrado(progreso)
        })
      }
      await pbAdmin.collection('empresa').delete(actual.id)
      setEliminando(null)
      await cargar()
    } catch (e) {
      setErrorBorrado(`${mensajeError(e, 'No se pudo completar la eliminación.')} Se eliminaron ${progreso} registros relacionados. Podés volver a intentarlo para borrar los restantes.`)
      await cargar()
    } finally { setBorrando(false) }
  }

  return (
    <main className="contenido ancho">
      <div className="encabezado">
        <div><h1>Empresas</h1><p className="sub">Todas las empresas registradas. Entrá a una para ver sus usuarios, clientes, ítems y presupuestos, o para cambiar su marca.</p></div>
        <button className="btn chico" onClick={() => setCreando(true)}>Nueva empresa</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="tabla-caja">
        <table className="tabla">
          <thead><tr><th>Empresa</th><th className="num">Usuarios</th><th className="num">Clientes</th><th className="num">Ítems</th><th className="num">Presupuestos</th><th><span className="sr">Acciones</span></th></tr></thead>
          <tbody>
            {filas === null && <tr><td colSpan={6} className="vacio">Cargando…</td></tr>}
            {filas?.length === 0 && <tr><td colSpan={6} className="vacio">Todavía no hay empresas. Creá la primera.</td></tr>}
            {filas?.map((fila) => {
              const { empresa: e, usuarios, clientes, items, presupuestos } = fila
              return (
              <tr key={e.id}>
                <td><span className="punto" style={{ background: e.colorPrimario }} /> <strong>{e.nombre}</strong><small>{e.email || 'sin correo de contacto'}</small></td>
                <td className="num">{usuarios}</td><td className="num">{clientes}</td><td className="num">{items}</td><td className="num">{presupuestos}</td>
                <td className="acciones"><Link className="link" to={`/propietario/empresas/${e.id}`}>Abrir</Link><button className="link peligro" onClick={() => { setErrorBorrado(''); setEliminando(fila) }}>Eliminar</button></td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {creando && <NuevaEmpresa alCerrar={() => setCreando(false)} />}
      {eliminando && (
        <Ventana titulo={`Eliminar ${eliminando.empresa.nombre}`} alCerrar={() => { if (!borrando) setEliminando(null) }}>
          <div className="form">
            <p>Esta acción es permanente. Se eliminarán la empresa y todos sus datos asociados:</p>
            <ul className="lista-borrado">
              <li>{eliminando.usuarios} usuarios</li>
              <li>{eliminando.clientes} clientes</li>
              <li>{eliminando.items} ítems de catálogo</li>
              <li>{eliminando.presupuestos} presupuestos</li>
              <li>La empresa y su logo</li>
            </ul>
            {borrando && <p role="status">Eliminando datos… {progresoBorrado} registros borrados.</p>}
            {errorBorrado && <p className="error" role="alert">{errorBorrado}</p>}
            <div className="botones">
              <button type="button" className="btn sec chico" disabled={borrando} onClick={() => setEliminando(null)}>Cancelar</button>
              <button type="button" className="btn chico btn-peligro" disabled={borrando} onClick={borrar}>{borrando ? 'Eliminando…' : 'Eliminar empresa y datos'}</button>
            </div>
          </div>
        </Ventana>
      )}
    </main>
  )
}

function NuevaEmpresa({ alCerrar }: { alCerrar: () => void }) {
  const navigate = useNavigate()
  const [plantillaBase, setPlantillaBase] = useState<Empresa | null>(null)
  const [plantillaConsultada, setPlantillaConsultada] = useState(false)
  const [usarPlantilla, setUsarPlantilla] = useState(false)
  const [nombre, setNombre] = useState('')
  const [primario, setPrimario] = useState('#0B2545')
  const [acento, setAcento] = useState('#5BB5F0')
  const [admin, setAdmin] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState(generarClave())
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    pbAdmin.collection<Empresa>('empresa').getFirstListItem('nombre="PresupuestAR"')
      .then(setPlantillaBase)
      .catch(() => setPlantillaBase(null))
      .finally(() => { if (vigente) setPlantillaConsultada(true) })
    return () => { vigente = false }
  }, [])

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!nombre.trim() || !correo.trim()) return setError('Faltan el nombre de la empresa y el correo del administrador.')
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setError(''); setGuardando(true)
    try {
      const base = usarPlantilla ? plantillaBase : null
      const datos = {
        nombre: nombre.trim(), colorPrimario: primario, colorAcento: acento,
        fuenteTitulos: base?.fuenteTitulos || 'Poppins', fuenteTexto: base?.fuenteTexto || 'Poppins',
        validezDias: base?.validezDias && base.validezDias >= 1 ? base.validezDias : 15,
        condiciones: base?.condiciones ?? 'Precios expresados en pesos argentinos.', mostrarSello: base?.mostrarSello ?? true,
      }
      let e: Empresa
      if (base?.logo) {
        const urlLogo = pbAdmin.files.getURL(base, base.logo)
        const respuestaLogo = await fetch(urlLogo, { headers: { Authorization: pbAdmin.authStore.token } })
        if (!respuestaLogo.ok) throw new Error('No se pudo copiar el logo de PresupuestAR. Desmarcá la opción para continuar sin esa identidad.')
        const archivoLogo = await respuestaLogo.blob()
        const formulario = new FormData()
        for (const [campo, valor] of Object.entries(datos)) formulario.append(campo, String(valor))
        formulario.append('logo', new File([archivoLogo], base.logo, { type: archivoLogo.type || 'image/png' }))
        e = await pbAdmin.collection<Empresa>('empresa').create(formulario)
      } else {
        e = await pbAdmin.collection<Empresa>('empresa').create(datos)
      }
      try {
        await pbAdmin.collection('users').create({ email: correo.trim(), password: clave, passwordConfirm: clave, name: admin.trim(), empresa: e.id, rol: 'admin', emailVisibility: true, verified: true })
      } catch (err) {
        setError('La empresa se creó, pero no su administrador: ' + mensajeError(err, '') + ' Abrila y agregá el usuario desde la pestaña Usuarios.')
        setGuardando(false); return
      }
      alert(`Empresa creada.\n\nAdministrador: ${correo.trim()}\nContraseña: ${clave}\n\nAnotá la contraseña: no se vuelve a mostrar.`)
      navigate(`/propietario/empresas/${e.id}`)
    } catch (err) { setError(mensajeError(err, 'No se pudo crear la empresa.')); setGuardando(false) }
  }

  return (
    <Ventana titulo="Nueva empresa" alCerrar={alCerrar}>
      <form onSubmit={enviar} className="form" noValidate>
        <label className="campo">Nombre de la empresa<input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={120} /></label>
        {plantillaConsultada && plantillaBase && (
          <label className="check">
            <input type="checkbox" checked={usarPlantilla} onChange={(e) => {
              const activa = e.target.checked
              setUsarPlantilla(activa)
              if (activa && plantillaBase) {
                setPrimario(plantillaBase.colorPrimario)
                setAcento(plantillaBase.colorAcento)
              }
            }} />
            No tiene identidad de marca: usar la de PresupuestAR
          </label>
        )}
        {!plantillaConsultada && <p className="ayuda">Buscando la identidad base de PresupuestAR…</p>}
        {plantillaConsultada && !plantillaBase && <p className="ayuda">No se encontró PresupuestAR como plantilla; podés definir los colores ahora y completar la marca después.</p>}
        <div className="dos">
          <label className="campo">Color principal<input type="color" value={primario} onChange={(e) => setPrimario(e.target.value)} className="color" /></label>
          <label className="campo">Color de acento<input type="color" value={acento} onChange={(e) => setAcento(e.target.value)} className="color" /></label>
        </div>
        <p className="ayuda">{usarPlantilla
          ? 'Se copiarán logo, colores, tipografías, validez y condiciones. El nombre y los datos propios se editan en Datos y marca después de crearla.'
          : 'Después podés completar el logo y los demás datos desde la pestaña Datos y marca.'}</p>
        <h3>Primer administrador</h3>
        <label className="campo">Nombre <small>(opcional)</small><input value={admin} onChange={(e) => setAdmin(e.target.value)} /></label>
        <label className="campo">Correo electrónico<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" /></label>
        <label className="campo">Contraseña inicial<input value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones"><button type="button" className="btn sec chico" onClick={alCerrar}>Cancelar</button><button className="btn chico" disabled={guardando}>{guardando ? 'Creando…' : 'Crear empresa'}</button></div>
      </form>
    </Ventana>
  )
}

function Ventana({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: React.ReactNode }) {
  const [ref, setRef] = useState<HTMLDialogElement | null>(null)
  useEffect(() => { ref?.showModal() }, [ref])
  return (
    <dialog ref={setRef} onClose={alCerrar} onClick={(e) => { if (e.target === ref) ref?.close() }}>
      <div className="form" style={{ paddingBottom: 0 }}><h2>{titulo}</h2></div>
      {children}
    </dialog>
  )
}

// ---------------------------------------------------------------- detalle de una empresa
type Pestana = 'datos' | 'usuarios' | 'clientes' | 'items' | 'presupuestos'
const PESTANAS: [Pestana, string][] = [['datos', 'Datos y marca'], ['usuarios', 'Usuarios'], ['clientes', 'Clientes'], ['items', 'Ítems'], ['presupuestos', 'Presupuestos']]

function DetalleEmpresa({ id }: { id: string }) {
  const [empresa, setEmpresa] = useState<Empresa | null | undefined>(undefined)
  const [pestana, setPestana] = useState<Pestana>('datos')
  const [error, setError] = useState('')

  useEffect(() => {
    pbAdmin.collection<Empresa>('empresa').getOne(idSeguro(id)).then(setEmpresa)
      .catch((e) => { setEmpresa(null); setError(mensajeError(e, 'No se encontró la empresa.')) })
  }, [id])

  if (empresa === undefined) return <main className="contenido"><p className="sub">Cargando…</p></main>
  if (!empresa) return <main className="contenido"><p className="error" role="alert">{error}</p><Link className="btn sec chico" to="/propietario">Volver a las empresas</Link></main>

  return (
    <main className="contenido ancho">
      <p className="migas"><Link to="/propietario">← Todas las empresas</Link></p>
      <h1><span className="punto grande" style={{ background: empresa.colorPrimario }} /> {empresa.nombre}</h1>
      <div className="pestanas" role="tablist">
        {PESTANAS.map(([k, t]) => <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? 'activa' : ''} onClick={() => setPestana(k)}>{t}</button>)}
      </div>
      {pestana === 'datos' && <DatosEmpresa empresa={empresa} alGuardar={setEmpresa} />}
      {pestana === 'usuarios' && <UsuariosEmpresa empresa={empresa} />}
      {pestana === 'clientes' && <ClientesEmpresa empresa={empresa} />}
      {pestana === 'items' && <ItemsEmpresa empresa={empresa} />}
      {pestana === 'presupuestos' && <PresupuestosEmpresa empresa={empresa} />}
    </main>
  )
}

function DatosEmpresa({ empresa, alGuardar }: { empresa: Empresa; alGuardar: (e: Empresa) => void }) {
  const [v, setV] = useState({
    nombre: empresa.nombre, documento: empresa.documento ?? '', email: empresa.email ?? '', telefono: empresa.telefono ?? '',
    colorPrimario: empresa.colorPrimario, colorAcento: empresa.colorAcento, fuenteTitulos: empresa.fuenteTitulos ?? '', fuenteTexto: empresa.fuenteTexto ?? '',
    validezDias: String(empresa.validezDias ?? 15), condiciones: empresa.condiciones ?? '', mostrarSello: empresa.mostrarSello !== false,
  })
  const [archivos, setArchivos] = useState<Record<string, File | undefined>>({})
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof v, valor: string | boolean) => setV((x) => ({ ...x, [k]: valor }))
  const logo = repositorio.empresa.archivoUrl(empresa, empresa.logo)

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault(); setMsg(null); setGuardando(true)
    try {
      const fd = new FormData()
      for (const [k, valor] of Object.entries(v)) fd.append(k, String(valor))
      for (const [k, f] of Object.entries(archivos)) if (f) fd.append(k, f)
      const nueva = await pbAdmin.collection<Empresa>('empresa').update(empresa.id, fd)
      alGuardar(nueva); setArchivos({}); setMsg({ ok: true, texto: 'Cambios guardados. Los usuarios de esta empresa los ven al volver a ingresar o recargar.' })
    } catch (e) { setMsg({ ok: false, texto: mensajeError(e, 'No se pudieron guardar los cambios.') }) }
    finally { setGuardando(false) }
  }
  const archivo = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setArchivos((a) => ({ ...a, [k]: e.target.files?.[0] }))

  return (
    <form onSubmit={enviar} className="panel" noValidate>
      <h2>Datos de la empresa</h2>
      <div className="tres">
        <label className="campo">Nombre<input value={v.nombre} onChange={(e) => set('nombre', e.target.value)} /></label>
        <label className="campo">CUIT <small>(opcional)</small><input value={v.documento} onChange={(e) => set('documento', e.target.value)} /></label>
        <label className="campo">Teléfono<input value={v.telefono} onChange={(e) => set('telefono', e.target.value)} /></label>
        <label className="campo">Correo de contacto<input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="campo">Validez por defecto (días)<input inputMode="numeric" value={v.validezDias} onChange={(e) => set('validezDias', e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={v.mostrarSello} onChange={(e) => set('mostrarSello', e.target.checked)} /> Mostrar "Hecho con PresupuestAR"</label>
      </div>
      <label className="campo">Condiciones generales <small>(salen en todos los PDF)</small><textarea rows={2} value={v.condiciones} onChange={(e) => set('condiciones', e.target.value)} /></label>

      <h2>Marca</h2>
      <div className="tres">
        <label className="campo">Color principal<input type="color" className="color" value={v.colorPrimario} onChange={(e) => set('colorPrimario', e.target.value)} /></label>
        <label className="campo">Color de acento<input type="color" className="color" value={v.colorAcento} onChange={(e) => set('colorAcento', e.target.value)} /></label>
        <div className="campo">Logo actual {logo ? <img src={logo} alt="Logo" className="logo-prev" /> : <small>Sin logo (se usa la inicial)</small>}</div>
        <label className="campo">Subir logo <small>(SVG, PNG, JPG o WebP)</small><input type="file" accept="image/*" onChange={archivo('logo')} /></label>
        <label className="campo">Tipografía de títulos <small>(nombre en Google Fonts)</small><input value={v.fuenteTitulos} onChange={(e) => set('fuenteTitulos', e.target.value)} placeholder="Poppins" /></label>
        <label className="campo">Tipografía de texto <small>(nombre en Google Fonts)</small><input value={v.fuenteTexto} onChange={(e) => set('fuenteTexto', e.target.value)} placeholder="Poppins" /></label>
        <label className="campo">Archivo de fuente para títulos <small>(.ttf, para el PDF)</small><input type="file" accept=".ttf,.otf,.woff" onChange={archivo('fuenteTitulosArchivo')} /></label>
        <label className="campo">Archivo de fuente para texto <small>(.ttf, para el PDF)</small><input type="file" accept=".ttf,.otf,.woff" onChange={archivo('fuenteTextoArchivo')} /></label>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.texto}</p>}
      <div className="botones izq"><button className="btn chico" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  )
}

function useLista<T>(coleccion: string, empresaId: string, sort: string) {
  const [lista, setLista] = useState<T[] | null>(null)
  const [error, setError] = useState('')
  const cargar = () => pbAdmin.collection<T & { id: string }>(coleccion).getFullList({ filter: filtroEmpresa(empresaId), sort })
    .then((l) => setLista(l as T[])).catch((e) => { setLista([]); setError(mensajeError(e, 'No se pudieron cargar los datos.')) })
  useEffect(() => { cargar() }, [coleccion, empresaId])
  return { lista, error, setError, cargar }
}

function Tabla({ cabeceras, filas, vacio }: { cabeceras: string[]; filas: React.ReactNode[][] | null; vacio: string }) {
  return (
    <div className="tabla-caja">
      <table className="tabla">
        <thead><tr>{cabeceras.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {filas === null && <tr><td colSpan={cabeceras.length} className="vacio">Cargando…</td></tr>}
          {filas?.length === 0 && <tr><td colSpan={cabeceras.length} className="vacio">{vacio}</td></tr>}
          {filas?.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function UsuariosEmpresa({ empresa }: { empresa: Empresa }) {
  const { lista, error, setError, cargar } = useLista<UsuarioEquipo>('users', empresa.id, 'created')
  const [email, setEmail] = useState(''); const [nombre, setNombre] = useState(''); const [rol, setRol] = useState<'admin' | 'miembro'>('miembro'); const [clave, setClave] = useState(generarClave())
  const [claveDe, setClaveDe] = useState<UsuarioEquipo | null>(null)

  const crear = async (ev: FormEvent) => {
    ev.preventDefault(); setError('')
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    try {
      await pbAdmin.collection('users').create({ email: email.trim(), password: clave, passwordConfirm: clave, name: nombre.trim(), empresa: empresa.id, rol, emailVisibility: true, verified: true })
      alert(`Usuario creado.\n\nCorreo: ${email.trim()}\nContraseña: ${clave}\n\nAnotá la contraseña: no se vuelve a mostrar.`)
      setEmail(''); setNombre(''); setClave(generarClave()); cargar()
    } catch (e) { setError(mensajeError(e, 'No se pudo crear el usuario.')) }
  }
  const cambiarRol = async (u: UsuarioEquipo, nuevo: 'admin' | 'miembro') => {
    try { await pbAdmin.collection('users').update(u.id, { rol: nuevo }); cargar() } catch (e) { setError(mensajeError(e, 'No se pudo cambiar el rol.')) }
  }
  const eliminar = async (u: UsuarioEquipo) => {
    if (!confirm(`¿Eliminar a ${u.name || u.email}? Ya no podrá ingresar.`)) return
    try { await pbAdmin.collection('users').delete(u.id); cargar() } catch (e) { setError(mensajeError(e, 'No se pudo eliminar el usuario.')) }
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      <Tabla cabeceras={['Correo', 'Nombre', 'Rol', 'Alta', '']} vacio="Esta empresa no tiene usuarios."
        filas={lista?.map((u) => [u.email, u.name || '—',
          <select key="r" className="filtro-estado" value={u.rol} onChange={(e) => cambiarRol(u, e.target.value as 'admin' | 'miembro')} aria-label={`Rol de ${u.email}`}><option value="admin">Administrador</option><option value="miembro">Empleado</option></select>,
          fechaCorta(u.created),
          <span key="a" className="acciones"><button className="link" onClick={() => setClaveDe(u)}>Cambiar contraseña</button><button className="link peligro" onClick={() => eliminar(u)}>Eliminar</button></span>]) ?? null} />
      <form onSubmit={crear} className="panel" style={{ marginTop: 20 }} noValidate>
        <h2>Agregar usuario</h2>
        <div className="tres">
          <label className="campo">Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
          <label className="campo">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className="campo">Rol<select value={rol} onChange={(e) => setRol(e.target.value as 'admin' | 'miembro')}><option value="miembro">Empleado</option><option value="admin">Administrador</option></select></label>
          <label className="campo">Contraseña inicial<input value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} /></label>
        </div>
        <div className="botones izq"><button className="btn chico">Crear usuario</button></div>
      </form>
      {claveDe && <ClaveDialog titulo={`Nueva contraseña para ${claveDe.name || claveDe.email}`} alCerrar={() => setClaveDe(null)}
        alGuardar={async (c) => { await pbAdmin.collection('users').update(claveDe.id, { password: c, passwordConfirm: c }); alert(`Contraseña cambiada.\n\nCorreo: ${claveDe.email}\nContraseña: ${c}`) }} />}
    </>
  )
}

function ClientesEmpresa({ empresa }: { empresa: Empresa }) {
  const { lista, error } = useLista<Cliente>('clientes', empresa.id, 'nombre')
  return <>{error && <p className="error" role="alert">{error}</p>}<Tabla cabeceras={['Nombre completo', 'Correo electrónico', 'Teléfono']} vacio="Esta empresa no tiene clientes."
    filas={lista?.map((c) => [<strong key="n">{c.nombre}</strong>, c.email, c.telefono]) ?? null} /></>
}

function ItemsEmpresa({ empresa }: { empresa: Empresa }) {
  const { lista, error } = useLista<Item>('items', empresa.id, 'nombre')
  return <>{error && <p className="error" role="alert">{error}</p>}<Tabla cabeceras={['Ítem', 'Unidad', 'Precio', 'Estado']} vacio="Esta empresa no tiene ítems."
    filas={lista?.map((i) => [<strong key="n">{i.nombre}</strong>, i.unidad || '—', importeEnMoneda(i.precio, i.moneda), i.activo ? 'Activo' : 'Desactivado']) ?? null} /></>
}

function PresupuestosEmpresa({ empresa }: { empresa: Empresa }) {
  const { lista, error, setError } = useLista<Presupuesto>('presupuestos', empresa.id, '-numero')
  const [generando, setGenerando] = useState<string | null>(null)
  const resumen = useMemo(() => repositorio.resumenMensual(lista ?? []), [lista])

  const descargar = async (p: Presupuesto) => {
    setGenerando(p.id); setError('')
    try {
      const blob = await generarPdf(p, empresa)
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = nombreArchivo(p); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch { setError('No se pudo generar el PDF.') } finally { setGenerando(null) }
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      {resumen.length > 0 && <p className="ayuda">Último mes con actividad: <strong>{resumen[0].mes} ({normalizarMoneda(resumen[0].moneda)})</strong> · {resumen[0].cantidad} presupuestos · presupuestado {importeEnMoneda(resumen[0].presupuestado, resumen[0].moneda)} · aceptado {importeEnMoneda(resumen[0].aceptado, resumen[0].moneda)} · conversión {resumen[0].conversionPct}%</p>}
      <Tabla cabeceras={['N°', 'Fecha', 'Cliente', 'Vendedor', 'Total', 'Estado', '']} vacio="Esta empresa no tiene presupuestos."
        filas={lista?.map((p) => [<strong key="n">{String(p.numero).padStart(4, '0')}</strong>, fechaCorta(p.fechaEmision || p.created),
          <span key="c">{p.clienteDatos?.nombre || 'Sin completar'}<small>{p.clienteDatos?.email}</small></span>, p.vendedorNombre || '—', importeEnMoneda(p.total, p.moneda), ETIQUETA[p.estado],
          <button key="d" className="link" disabled={generando === p.id} onClick={() => descargar(p)}>{generando === p.id ? 'Generando…' : 'PDF'}</button>]) ?? null} />
    </>
  )
}
