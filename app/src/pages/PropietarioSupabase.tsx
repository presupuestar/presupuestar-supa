import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '../context/Sesion'
import { Isotipo } from '../components/Isotipo'
import { generarClave } from '../lib/clave'
import { mensajeError } from '../lib/errores'
import { supabase } from '../lib/supabase'

interface EmpresaFila {
  id: string
  name: string
  email: string | null
  primary_color: string
  users: number
  items: number
  clients: number
  quotes: number
}

export function PropietarioSupabase() {
  const { usuario, entrar, salir, cargando } = useSesion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [empresas, setEmpresas] = useState<EmpresaFila[] | null>(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [nombreEmpresa, setNombreEmpresa] = useState('')
  const [nombreAdmin, setNombreAdmin] = useState('')
  const [correoAdmin, setCorreoAdmin] = useState('')
  const [claveAdmin, setClaveAdmin] = useState(generarClave())
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    const [companyResult, profileResult, itemResult, clientResult, quoteResult] = await Promise.all([
      supabase.from('companies').select('id,name,email,primary_color').order('name'),
      supabase.from('profiles').select('company_id'),
      supabase.from('items').select('company_id'),
      supabase.from('clients').select('company_id'),
      supabase.from('quotes').select('company_id'),
    ])
    for (const result of [companyResult, profileResult, itemResult, clientResult, quoteResult]) {
      if (result.error) throw result.error
    }
    if (!companyResult.data || !profileResult.data || !itemResult.data || !clientResult.data || !quoteResult.data) {
      throw new Error('Supabase no devolvió todos los datos para el panel del propietario.')
    }
    const countByCompany = (rows: { company_id: string | null }[]) => {
      const counts = new Map<string, number>()
      for (const row of rows) {
        if (row.company_id) counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1)
      }
      return counts
    }
    const profiles = countByCompany(profileResult.data)
    const items = countByCompany(itemResult.data)
    const clients = countByCompany(clientResult.data)
    const quotes = countByCompany(quoteResult.data)
    setEmpresas(companyResult.data.map((company) => ({
      ...company,
      users: profiles.get(company.id) ?? 0,
      items: items.get(company.id) ?? 0,
      clients: clients.get(company.id) ?? 0,
      quotes: quotes.get(company.id) ?? 0,
    })))
  }

  useEffect(() => {
    if (usuario?.rol !== 'propietario') return
    cargar().catch((e: unknown) => setError(mensajeError(e, 'No se pudieron cargar las empresas.')))
  }, [usuario?.id, usuario?.rol])

  const iniciarSesion = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try { await entrar(email.trim(), password) }
    catch (e) { setError(mensajeError(e, 'No se pudo iniciar sesión.')) }
  }

  const crearEmpresa = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setGuardando(true)
    try {
      const { error: functionError } = await supabase.functions.invoke('manage-platform', {
        body: {
          action: 'create-company',
          company: { name: nombreEmpresa.trim(), primary_color: '#0B2545', accent_color: '#5BB5F0', show_seal: true },
          admin: { name: nombreAdmin.trim(), email: correoAdmin.trim(), password: claveAdmin },
        },
      })
      if (functionError) throw functionError
      setMostrarFormulario(false)
      setNombreEmpresa('')
      setNombreAdmin('')
      setCorreoAdmin('')
      setClaveAdmin(generarClave())
      await cargar()
    } catch (e) {
      setError(mensajeError(e, 'No se pudo crear la empresa.'))
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return null
  if (!usuario) {
    return (
      <main className="login panel-propietario">
        <section className="login-lado">
          <span className="marca"><Isotipo size={44} /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
          <h1>Panel del propietario</h1>
          <p>Acceso exclusivo a la administración de la plataforma.</p>
        </section>
        <section className="login-form">
          <form onSubmit={iniciarSesion}>
            <h2>Ingresá con tu cuenta de Supabase</h2>
            <label>Correo electrónico<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <Link className="link" to="/recuperar">¿Olvidaste tu contraseña?</Link>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn">Ingresar</button>
          </form>
        </section>
      </main>
    )
  }

  if (usuario.rol !== 'propietario') {
    return <main className="contenido"><h1>Acceso exclusivo del propietario</h1><p className="sub">Esta cuenta no tiene permisos de plataforma.</p><button className="btn chico" onClick={salir}>Salir</button></main>
  }

  return (
    <div className="app panel-propietario">
      <header className="barra">
        <span className="marca"><Isotipo size={32} /><strong>PresupuestAR · Propietario</strong></span>
        <span className="usuario">{usuario.email} <button className="link" onClick={salir}>Salir</button></span>
      </header>
      <main className="contenido ancho">
        <div className="encabezado">
          <div><h1>Empresas</h1><p className="sub">Empresas y datos importados desde PocketBase.</p></div>
          <button className="btn chico" onClick={() => setMostrarFormulario(true)}>Nueva empresa</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="tabla-caja">
          <table className="tabla">
            <thead><tr><th>Empresa</th><th className="num">Usuarios</th><th className="num">Clientes</th><th className="num">Ítems</th><th className="num">Presupuestos</th></tr></thead>
            <tbody>
              {empresas === null && <tr><td colSpan={5} className="vacio">Cargando…</td></tr>}
              {empresas?.length === 0 && <tr><td colSpan={5} className="vacio">No hay empresas.</td></tr>}
              {empresas?.map((company) => (
                <tr key={company.id}>
                  <td><span className="punto" style={{ background: company.primary_color }} /> <strong>{company.name}</strong><small>{company.email || 'sin correo de contacto'}</small></td>
                  <td className="num">{company.users}</td><td className="num">{company.clients}</td><td className="num">{company.items}</td><td className="num">{company.quotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      {mostrarFormulario && (
        <dialog className="ventana" open>
          <form onSubmit={crearEmpresa} className="form">
            <h2>Nueva empresa</h2>
            <label className="campo">Nombre de la empresa<input value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} required maxLength={120} /></label>
            <label className="campo">Nombre del administrador<input value={nombreAdmin} onChange={(e) => setNombreAdmin(e.target.value)} required maxLength={120} /></label>
            <label className="campo">Correo del administrador<input type="email" value={correoAdmin} onChange={(e) => setCorreoAdmin(e.target.value)} required /></label>
            <label className="campo">Contraseña inicial<input value={claveAdmin} onChange={(e) => setClaveAdmin(e.target.value)} required minLength={8} maxLength={72} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="botones">
              <button type="button" className="btn sec chico" onClick={() => setMostrarFormulario(false)} disabled={guardando}>Cancelar</button>
              <button className="btn chico" disabled={guardando}>{guardando ? 'Creando…' : 'Crear empresa'}</button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  )
}
