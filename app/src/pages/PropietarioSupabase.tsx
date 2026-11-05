import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { ClaveDialog } from '../components/ClaveDialog'
import { Isotipo } from '../components/Isotipo'
import { VolverArriba } from '../components/PreferenciasVisuales'
import { generarClave } from '../lib/clave'
import { mensajeError } from '../lib/errores'
import { fechaCorta } from '../lib/formato'
import { supabasePropietario as supabase } from '../lib/supabase'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { EnlacesLegales } from '../components/EnlacesLegales'

interface Company {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  logo_path: string | null
  title_font_path: string | null
  text_font_path: string | null
  primary_color: string
  accent_color: string
  title_font: string | null
  text_font: string | null
  validity_days: number | null
  terms: string | null
  show_seal: boolean
  plan_tier?: string
  status?: string
  storage_usage_bytes?: number
}

interface CompanyRow extends Pick<Company, 'id' | 'name' | 'email' | 'primary_color'> {
  users: number
  plan_tier: string
  status: string
  storage_usage_bytes: number
}

interface UserRow {
  user_id: string
  email: string
  name: string
  role: 'admin' | 'member'
  created_at: string
}

type Tab = 'datos' | 'usuarios'
const tabs: [Tab, string][] = [
  ['datos', 'Datos y marca'], ['usuarios', 'Usuarios'],
]

async function platformAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-platform', { body })
  if (error instanceof FunctionsHttpError) {
    const responseText = await error.context.clone().text()
    if (responseText) {
      let responseBody: unknown
      try {
        responseBody = JSON.parse(responseText)
      } catch {
        throw new Error(responseText)
      }
      if (responseBody && typeof responseBody === 'object' && 'error' in responseBody
        && typeof responseBody.error === 'string') throw new Error(responseBody.error)
      throw new Error(responseText)
    }
    throw new Error(`La función de administración respondió con el estado ${error.context.status}.`)
  }
  if (error) throw error
  return data
}

export function PropietarioSupabase() {
  const [usuario, setUsuario] = useState<{ id: string; email: string; rol: string } | null>(null)
  const [cargando, setCargando] = useState(true)
  const { id } = useParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [tab, setTab] = useState<Tab>('datos')
  const [showCreate, setShowCreate] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState(generarClave())
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const createDialog = useRef<HTMLDialogElement>(null)
  const deleteDialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let vigente = true
    const cargarPropietario = async (session: Session | null) => {
      if (!session?.user) {
        if (vigente) {
          setUsuario(null)
          setCargando(false)
        }
        return
      }
      try {
        const { data: esPropietario, error: ownerError } = await supabase.rpc('is_platform_owner')
        if (ownerError) throw ownerError
        if (vigente) setUsuario({
          id: session.user.id,
          email: session.user.email ?? '',
          rol: esPropietario ? 'propietario' : 'usuario',
        })
      } catch (e) {
        if (vigente) {
          setUsuario(null)
          setError(mensajeError(e, 'No se pudo validar el acceso del propietario.'))
        }
      } finally {
        if (vigente) setCargando(false)
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void cargarPropietario(session) })
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError
      return cargarPropietario(data.session)
    }).catch((e: unknown) => {
      if (vigente) {
        setError(mensajeError(e, 'No se pudo validar la sesión del propietario.'))
        setCargando(false)
      }
    })

    return () => {
      vigente = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (showCreate && createDialog.current && !createDialog.current.open) createDialog.current.showModal()
  }, [showCreate])

  useEffect(() => {
    if (confirmDelete && deleteDialog.current && !deleteDialog.current.open) deleteDialog.current.showModal()
  }, [confirmDelete])

  const loadCompanies = async () => {
    const directory = await supabase.rpc('platform_company_directory')
    const profileResult = await supabase.from('profiles').select('company_id')
    if (profileResult.error) throw profileResult.error
    const users = new Map<string, number>()
    for (const row of profileResult.data ?? []) {
      if (row.company_id) users.set(row.company_id, (users.get(row.company_id) ?? 0) + 1)
    }
    if (!directory.error && directory.data) {
      setCompanies(directory.data.map((row: { id: string; name: string; email: string | null; primary_color: string; plan_tier: string; status: string; storage_usage_bytes: number }) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        primary_color: row.primary_color,
        plan_tier: row.plan_tier,
        status: row.status,
        storage_usage_bytes: Number(row.storage_usage_bytes) || 0,
        users: users.get(row.id) ?? 0,
      })))
      return
    }
    const companyResult = await supabase.from('companies').select('id,name,email,primary_color').order('name')
    if (companyResult.error) throw companyResult.error
    setCompanies((companyResult.data ?? []).map((row) => ({
      ...row,
      plan_tier: 'inicial',
      status: 'activa',
      storage_usage_bytes: 0,
      users: users.get(row.id) ?? 0,
    })))
  }

  const loadCompany = async (companyId: string) => {
    const { data, error: resultError } = await supabase.from('companies').select('*').eq('id', companyId).single()
    if (resultError) throw resultError
    setCompany(data as Company)
  }

  useEffect(() => {
    if (usuario?.rol !== 'propietario') return
    setError('')
    if (id) {
      setCompany(null)
      setTab('datos')
      loadCompany(id).catch((e: unknown) => setError(mensajeError(e, 'No se encontró la empresa.')))
    } else {
      setCompany(null)
      loadCompanies().catch((e: unknown) => setError(mensajeError(e, 'No se pudieron cargar las empresas.')))
    }
  }, [usuario?.id, usuario?.rol, id])

  const iniciarSesion = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginError) throw loginError
    }
    catch (e) { setError(mensajeError(e, 'No se pudo iniciar sesión.')) }
  }

  const salir = () => { void supabase.auth.signOut({ scope: 'local' }) }

  const createCompany = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await platformAction({
        action: 'create-company',
        company: { name: companyName.trim(), primary_color: '#0B2545', accent_color: '#5BB5F0', show_seal: true },
        admin: { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword },
      })
      alert(`Empresa creada.\n\nAdministrador: ${adminEmail.trim()}\nContraseña inicial: ${adminPassword}\n\nAnotá la contraseña: no se vuelve a mostrar.`)
      setShowCreate(false)
      setCompanyName('')
      setAdminName('')
      setAdminEmail('')
      setAdminPassword(generarClave())
      await loadCompanies()
    } catch (e) { setError(mensajeError(e, 'No se pudo crear la empresa.')) }
    finally { setBusy(false) }
  }

  const deleteCompany = async () => {
    if (!company) return
    setBusy(true)
    setError('')
    try {
      await platformAction({ action: 'delete-company', companyId: company.id })
      setConfirmDelete(false)
      navigate('/propietario', { replace: true })
      setCompany(null)
      await loadCompanies()
    } catch (e) { setError(mensajeError(e, 'No se pudo eliminar la empresa.')) }
    finally { setBusy(false) }
  }

  if (cargando) return null
  if (!usuario) {
    return (
      <main className="login panel-propietario">
        <section className="login-lado">
          <span className="marca"><Isotipo size={44} /><strong>Presupuest<b style={{ color: '#5BB5F0' }}>AR</b></strong></span>
          <h1>Panel del propietario</h1><p>Acceso exclusivo a la administración de la plataforma.</p>
        </section>
        <section className="login-form">
          <form onSubmit={iniciarSesion}>
            <h2>Ingresá con tu cuenta de Supabase</h2>
            <label>Correo electrónico<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <Link className="link" to="/recuperar?owner=1">¿Olvidaste tu contraseña?</Link>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn">Ingresar</button>
            <EnlacesLegales />
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
        <Link className="marca" to="/propietario"><Isotipo size={32} /><strong>PresupuestAR · Propietario</strong></Link>
        <span className="usuario">{usuario.email} <button className="link" onClick={salir}>Salir</button></span>
      </header>
      {id && company ? (
        <main className="contenido ancho">
          <p><Link className="link" to="/propietario">← Todas las empresas</Link></p>
          <h1><span className="punto" style={{ background: company.primary_color }} /> {company.name}</h1>
          <nav className="pestanas">
            {tabs.map(([key, title]) => <button key={key} className={tab === key ? 'activa' : ''} onClick={() => setTab(key)}>{title}</button>)}
          </nav>
          {error && <p className="error" role="alert">{error}</p>}
          {tab === 'datos' && <CompanySettings company={company} saveCompany={setCompany} onError={setError} onDelete={() => setConfirmDelete(true)} />}
          {tab === 'usuarios' && <CompanyUsers companyId={company.id} onError={setError} />}
        </main>
      ) : id ? (
        <main className="contenido ancho">{error ? <p className="error" role="alert">{error}</p> : <p className="sub">Cargando empresa…</p>}</main>
      ) : (
        <main className="contenido ancho">
          <div className="encabezado">
            <div><h1>Empresas</h1><p className="sub">Cuentas del servicio. Este panel no muestra presupuestos, clientes ni catálogos.</p></div>
            <button className="btn chico" onClick={() => setShowCreate(true)}>Nueva empresa</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="tabla-caja"><table className="tabla">
            <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th className="num">Usuarios</th><th className="num">Almacenamiento</th><th /></tr></thead>
            <tbody>
              {companies === null && <tr><td colSpan={6} className="vacio">Cargando…</td></tr>}
              {companies?.length === 0 && <tr><td colSpan={6} className="vacio">No hay empresas.</td></tr>}
              {companies?.map((row) => <tr key={row.id}>
                <td><span className="punto" style={{ background: row.primary_color }} /> <strong>{row.name}</strong><small>{row.email || 'sin correo de contacto'}</small></td>
                <td>{etiquetaPlan(row.plan_tier)}</td>
                <td>{etiquetaEstadoCuenta(row.status)}</td>
                <td className="num">{row.users}</td>
                <td className="num">{formatearBytes(row.storage_usage_bytes)}</td>
                <td><Link className="link" to={`/propietario/empresas/${row.id}`}>Abrir y editar</Link></td>
              </tr>)}
            </tbody>
          </table></div>
        </main>
      )}
      {showCreate && <dialog ref={createDialog} className="ventana" onClose={() => setShowCreate(false)}><form onSubmit={(event) => void createCompany(event)} className="form">
        <h2>Nueva empresa</h2>
        <label className="campo">Nombre de la empresa<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} /></label>
        <label className="campo">Nombre del administrador<input value={adminName} onChange={(e) => setAdminName(e.target.value)} required maxLength={120} /></label>
        <label className="campo">Correo del administrador<input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required /></label>
        <label className="campo">Contraseña inicial<input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required minLength={8} maxLength={72} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones"><button type="button" className="btn sec chico" onClick={() => setShowCreate(false)}>Cancelar</button><button className="btn chico" disabled={busy}>{busy ? 'Creando…' : 'Crear empresa'}</button></div>
      </form></dialog>}
      {confirmDelete && company && <dialog
        ref={deleteDialog}
        className="ventana"
        aria-labelledby="eliminar-empresa-titulo"
        aria-describedby="eliminar-empresa-descripcion"
        onClose={() => setConfirmDelete(false)}
        onCancel={(event) => { if (busy) event.preventDefault() }}
        onClick={(event) => { if (event.target === deleteDialog.current && !busy) deleteDialog.current?.close() }}
      ><div className="form">
        <h2 id="eliminar-empresa-titulo">Eliminar {company.name}</h2><p id="eliminar-empresa-descripcion">Se eliminarán permanentemente la empresa, sus usuarios y sus datos. Esta acción no se puede deshacer.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones"><button className="btn sec chico" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button><button className="btn chico peligro" disabled={busy} onClick={() => void deleteCompany()}>{busy ? 'Eliminando…' : 'Eliminar empresa y datos'}</button></div>
      </div></dialog>}
      <VolverArriba />
    </div>
  )
}

function CompanySettings({ company, saveCompany, onError, onDelete }: {
  company: Company
  saveCompany: (company: Company) => void
  onError: (message: string) => void
  onDelete: () => void
}) {
  const [form, setForm] = useState(company)
  const [logo, setLogo] = useState<File | null>(null)
  const [titleFontFile, setTitleFontFile] = useState<File | null>(null)
  const [textFontFile, setTextFontFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const change = (key: keyof Company, value: string | boolean | number) => setForm((old) => ({ ...old, [key]: value }))
  const assetUrl = (path: string | null) => path ? supabase.storage.from('company-assets').getPublicUrl(path).data.publicUrl : ''
  useEffect(() => setForm(company), [company.id])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setMessage(''); onError('')
    try {
      const changes: Record<string, unknown> = {
        name: form.name.trim(), document: form.document || null, email: form.email || null, phone: form.phone || null,
        primary_color: form.primary_color, accent_color: form.accent_color,
        title_font: form.title_font || null, text_font: form.text_font || null,
        validity_days: form.validity_days || 15, terms: form.terms || null, show_seal: form.show_seal,
        ...('plan_tier' in company ? { plan_tier: form.plan_tier || 'inicial', status: form.status || 'activa' } : {}),
      }
      const assets: [File | null, string, string][] = [
        [logo, 'logo', 'logo_path'],
        [titleFontFile, 'fuenteTitulosArchivo', 'title_font_path'],
        [textFontFile, 'fuenteTextoArchivo', 'text_font_path'],
      ]
      for (const [file, folder, column] of assets) {
        if (!file) continue
        const path = `${company.id}/${folder}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error } = await supabase.storage.from('company-assets').upload(path, file, { upsert: true })
        if (error) throw error
        changes[column] = path
      }
      await platformAction({ action: 'update-company', companyId: company.id, changes })
      const { data, error } = await supabase.from('companies').select('*').eq('id', company.id).single()
      if (error) throw error
      setForm(data as Company); saveCompany(data as Company)
      setLogo(null); setTitleFontFile(null); setTextFontFile(null)
      setMessage('Cambios guardados.')
    } catch (e) { setMessage(mensajeError(e, 'No se pudieron guardar los cambios.')) }
    finally { setSaving(false) }
  }

  return <form className="panel" onSubmit={(event) => void save(event)} noValidate>
    <h2>Datos de la empresa</h2>
    <div className="tres">
      <label className="campo">Nombre<input value={form.name} onChange={(e) => change('name', e.target.value)} required /></label>
      <label className="campo">CUIT<input value={form.document ?? ''} onChange={(e) => change('document', e.target.value)} /></label>
      <label className="campo">Teléfono<input value={form.phone ?? ''} onChange={(e) => change('phone', e.target.value)} /></label>
      <label className="campo">Correo de contacto<input type="email" value={form.email ?? ''} onChange={(e) => change('email', e.target.value)} /></label>
      <label className="campo">Validez predeterminada (días)<input type="number" min={1} value={form.validity_days ?? 15} onChange={(e) => change('validity_days', Number(e.target.value))} /></label>
      {'plan_tier' in company && <>
        <label className="campo">Plan<select value={form.plan_tier ?? 'inicial'} onChange={(e) => change('plan_tier', e.target.value)}><option value="inicial">Inicial</option><option value="profesional">Profesional</option><option value="empresa">Empresa</option></select></label>
        <label className="campo">Estado de la cuenta<select value={form.status ?? 'activa'} onChange={(e) => change('status', e.target.value)}><option value="activa">Activa</option><option value="suspendida">Suspendida</option><option value="cancelada">Cancelada</option></select></label>
        <p className="campo">Almacenamiento de marca<small>{formatearBytes(Number(form.storage_usage_bytes) || 0)}. No incluye presupuestos ni archivos de clientes.</small></p>
      </>}
      <label className="campo"><span>Sello</span><input type="checkbox" checked={form.show_seal} onChange={(e) => change('show_seal', e.target.checked)} /> Mostrar sello PresupuestAR</label>
    </div>
    <label className="campo">Condiciones generales<textarea rows={3} value={form.terms ?? ''} onChange={(e) => change('terms', e.target.value)} /></label>
    <h2>Marca</h2>
    <div className="tres">
      <label className="campo">Color principal<input type="color" value={form.primary_color} onChange={(e) => change('primary_color', e.target.value)} /></label>
      <label className="campo">Color de acento<input type="color" value={form.accent_color} onChange={(e) => change('accent_color', e.target.value)} /></label>
      <div className="campo">Logo actual {form.logo_path ? <img src={assetUrl(form.logo_path)} alt="Logo actual" style={{ display: 'block', maxWidth: 140, maxHeight: 80 }} /> : <small>Sin logo</small>}</div>
      <label className="campo">Subir logo<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></label>
      <label className="campo">Tipografía de títulos<input value={form.title_font ?? ''} onChange={(e) => change('title_font', e.target.value)} placeholder="Poppins" /></label>
      <label className="campo">Tipografía de texto<input value={form.text_font ?? ''} onChange={(e) => change('text_font', e.target.value)} placeholder="Poppins" /></label>
      <label className="campo">Archivo de fuente para títulos<input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(e) => setTitleFontFile(e.target.files?.[0] ?? null)} />{form.title_font_path && <small>Fuente cargada</small>}</label>
      <label className="campo">Archivo de fuente para texto<input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(e) => setTextFontFile(e.target.files?.[0] ?? null)} />{form.text_font_path && <small>Fuente cargada</small>}</label>
    </div>
    {message && <p className={message === 'Cambios guardados.' ? 'sub' : 'error'} role="status">{message}</p>}
    <div className="botones izq"><button className="btn chico" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button><button type="button" className="btn sec chico peligro" onClick={onDelete}>Eliminar empresa</button></div>
  </form>
}

function CompanyUsers({ companyId, onError }: { companyId: string; onError: (message: string) => void }) {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(generarClave())
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('user_id,email,name,role,created_at').eq('company_id', companyId).order('created_at')
    if (error) throw error
    setUsers(data as UserRow[])
  }
  useEffect(() => { load().catch((e: unknown) => onError(mensajeError(e, 'No se pudieron cargar los usuarios.'))) }, [companyId])

  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); onError('')
    try {
      await platformAction({ action: 'create-company-user', companyId, email: email.trim(), password, name: name.trim(), role })
      alert(`Usuario creado.\n\nCorreo: ${email.trim()}\nContraseña inicial: ${password}\n\nAnotá la contraseña: no se vuelve a mostrar.`)
      setName(''); setEmail(''); setPassword(generarClave()); await load()
    } catch (e) { onError(mensajeError(e, 'No se pudo crear el usuario.')) }
    finally { setBusy(false) }
  }
  const changeRole = async (user: UserRow, nextRole: 'admin' | 'member') => {
    try { await platformAction({ action: 'update-role', userId: user.user_id, role: nextRole }); await load() }
    catch (e) { onError(mensajeError(e, 'No se pudo cambiar el rol.')) }
  }
  const deleteUser = async (user: UserRow) => {
    if (!confirm(`¿Eliminar a ${user.name || user.email}? Ya no podrá ingresar.`)) return
    try { await platformAction({ action: 'delete-user', userId: user.user_id }); await load() }
    catch (e) { onError(mensajeError(e, 'No se pudo eliminar el usuario.')) }
  }

  return <>
    <Table headers={['Correo', 'Nombre', 'Rol', 'Alta', '']} empty="Esta empresa no tiene usuarios." rows={users?.map((user) => [
      user.email, user.name || '—',
      <select aria-label={`Rol de ${user.email}`} value={user.role} onChange={(e) => void changeRole(user, e.target.value as 'admin' | 'member')}><option value="admin">Administrador</option><option value="member">Empleado</option></select>,
      fechaCorta(user.created_at), <span className="acciones"><button className="link" onClick={() => setResetUser(user)}>Cambiar contraseña</button><button className="link peligro" onClick={() => void deleteUser(user)}>Eliminar</button></span>,
    ]) ?? null} />
    <form className="panel" style={{ marginTop: 20 }} onSubmit={(event) => void create(event)}>
      <h2>Agregar usuario</h2><div className="tres">
        <label className="campo">Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="campo">Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="campo">Rol<select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}><option value="member">Empleado</option><option value="admin">Administrador</option></select></label>
        <label className="campo">Contraseña inicial<input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
      </div><button className="btn chico" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</button>
    </form>
    {resetUser && <ClaveDialog titulo={`Nueva contraseña para ${resetUser.name || resetUser.email}`} alCerrar={() => setResetUser(null)} alGuardar={async (nextPassword) => {
      await platformAction({ action: 'reset-password', userId: resetUser.user_id, password: nextPassword })
      alert(`Contraseña cambiada.\n\nCorreo: ${resetUser.email}\nContraseña: ${nextPassword}`)
      setResetUser(null)
    }} />}
  </>
}

function etiquetaPlan(plan: string) {
  if (plan === 'profesional') return 'Profesional'
  if (plan === 'empresa') return 'Empresa'
  return 'Inicial'
}

function etiquetaEstadoCuenta(status: string) {
  if (status === 'suspendida') return 'Suspendida'
  if (status === 'cancelada') return 'Cancelada'
  return 'Activa'
}

function formatearBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Table({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][] | null; empty: string }) {
  return <div className="tabla-caja"><table className="tabla">
    <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>
      {rows === null && <tr><td colSpan={headers.length} className="vacio">Cargando…</td></tr>}
      {rows?.length === 0 && <tr><td colSpan={headers.length} className="vacio">{empty}</td></tr>}
      {rows?.map((cells, i) => <tr key={i}>{cells.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}
    </tbody>
  </table></div>
}
