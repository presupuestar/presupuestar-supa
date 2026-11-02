import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClaveDialog } from '../components/ClaveDialog'
import { Isotipo } from '../components/Isotipo'
import { PreferenciasVisuales, VolverArriba } from '../components/PreferenciasVisuales'
import { useSesion } from '../context/Sesion'
import { generarClave } from '../lib/clave'
import { mensajeError } from '../lib/errores'
import { fechaCorta, importeEnMoneda, normalizarMoneda } from '../lib/formato'
import { supabase } from '../lib/supabase'
import { generarPdf, nombreArchivo } from '../lib/pdf/generar'
import type { Empresa as EmpresaApp, Estado, Linea, Presupuesto } from '../lib/tipos'

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
}

interface CompanyRow extends Pick<Company, 'id' | 'name' | 'email' | 'primary_color'> {
  users: number
  items: number
  clients: number
  quotes: number
}

interface UserRow {
  user_id: string
  email: string
  name: string
  role: 'admin' | 'member'
  created_at: string
}

type Tab = 'datos' | 'usuarios' | 'clientes' | 'items' | 'presupuestos'
const tabs: [Tab, string][] = [
  ['datos', 'Datos y marca'], ['usuarios', 'Usuarios'], ['clientes', 'Clientes'],
  ['items', 'Ítems'], ['presupuestos', 'Presupuestos'],
]

async function platformAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-platform', { body })
  if (error) throw error
  return data
}

export function PropietarioSupabase() {
  const { usuario, entrar, salir, cargando } = useSesion()
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

  const loadCompanies = async () => {
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
      throw new Error('Supabase no devolvió todos los datos del panel.')
    }
    const countByCompany = (rows: { company_id: string | null }[]) => {
      const counts = new Map<string, number>()
      rows.forEach(({ company_id }) => {
        if (company_id) counts.set(company_id, (counts.get(company_id) ?? 0) + 1)
      })
      return counts
    }
    const profiles = countByCompany(profileResult.data)
    const items = countByCompany(itemResult.data)
    const clients = countByCompany(clientResult.data)
    const quotes = countByCompany(quoteResult.data)
    setCompanies(companyResult.data.map((row) => ({
      ...row,
      users: profiles.get(row.id) ?? 0,
      items: items.get(row.id) ?? 0,
      clients: clients.get(row.id) ?? 0,
      quotes: quotes.get(row.id) ?? 0,
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
    try { await entrar(email.trim(), password) }
    catch (e) { setError(mensajeError(e, 'No se pudo iniciar sesión.')) }
  }

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
        <Link className="marca" to="/propietario"><Isotipo size={32} /><strong>PresupuestAR · Propietario</strong></Link>
        <span className="usuario"><PreferenciasVisuales /> {usuario.email} <button className="link" onClick={salir}>Salir</button></span>
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
          {tab === 'clientes' && <CompanyTable key={tab} table="clients" companyId={company.id} onError={setError} />}
          {tab === 'items' && <CompanyTable key={tab} table="items" companyId={company.id} onError={setError} />}
          {tab === 'presupuestos' && <CompanyQuotes companyId={company.id} company={company} onError={setError} />}
        </main>
      ) : id ? (
        <main className="contenido ancho">{error ? <p className="error" role="alert">{error}</p> : <p className="sub">Cargando empresa…</p>}</main>
      ) : (
        <main className="contenido ancho">
          <div className="encabezado">
            <div><h1>Empresas</h1><p className="sub">Empresas y datos administrados en Supabase.</p></div>
            <button className="btn chico" onClick={() => setShowCreate(true)}>Nueva empresa</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="tabla-caja"><table className="tabla">
            <thead><tr><th>Empresa</th><th className="num">Usuarios</th><th className="num">Clientes</th><th className="num">Ítems</th><th className="num">Presupuestos</th><th /></tr></thead>
            <tbody>
              {companies === null && <tr><td colSpan={6} className="vacio">Cargando…</td></tr>}
              {companies?.length === 0 && <tr><td colSpan={6} className="vacio">No hay empresas.</td></tr>}
              {companies?.map((row) => <tr key={row.id}>
                <td><span className="punto" style={{ background: row.primary_color }} /> <strong>{row.name}</strong><small>{row.email || 'sin correo de contacto'}</small></td>
                <td className="num">{row.users}</td><td className="num">{row.clients}</td><td className="num">{row.items}</td><td className="num">{row.quotes}</td>
                <td><Link className="link" to={`/propietario/empresas/${row.id}`}>Abrir y editar</Link></td>
              </tr>)}
            </tbody>
          </table></div>
        </main>
      )}
      {showCreate && <dialog className="ventana" open><form onSubmit={(event) => void createCompany(event)} className="form">
        <h2>Nueva empresa</h2>
        <label className="campo">Nombre de la empresa<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} /></label>
        <label className="campo">Nombre del administrador<input value={adminName} onChange={(e) => setAdminName(e.target.value)} required maxLength={120} /></label>
        <label className="campo">Correo del administrador<input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required /></label>
        <label className="campo">Contraseña inicial<input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required minLength={8} maxLength={72} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones"><button type="button" className="btn sec chico" onClick={() => setShowCreate(false)}>Cancelar</button><button className="btn chico" disabled={busy}>{busy ? 'Creando…' : 'Crear empresa'}</button></div>
      </form></dialog>}
      {confirmDelete && company && <dialog className="ventana" open><div className="form">
        <h2>Eliminar {company.name}</h2><p>Se eliminarán permanentemente la empresa, sus usuarios y sus datos. Esta acción no se puede deshacer.</p>
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

type TableName = 'clients' | 'items' | 'quotes'
const tableColumns: Record<TableName, string> = {
  clients: 'name,email,phone,document,address',
  items: 'name,supplier,unit,price,currency,active',
  quotes: 'number,issue_date,client_snapshot,seller_name,total,currency,status',
}
const tableHeaders: Record<TableName, string[]> = {
  clients: ['Nombre completo', 'Correo electrónico', 'Teléfono', 'Documento', 'Dirección'],
  items: ['Ítem', 'Proveedor', 'Unidad', 'Precio', 'Estado'],
  quotes: ['N°', 'Fecha', 'Cliente', 'Vendedor', 'Total', 'Estado'],
}

function CompanyTable({ table, companyId, onError }: { table: TableName; companyId: string; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  useEffect(() => {
    setRows(null)
    supabase.from(table).select(tableColumns[table], { count: 'exact' }).eq('company_id', companyId)
      .order(table === 'quotes' ? 'number' : 'name', { ascending: table !== 'quotes' })
      .range(page * 100, page * 100 + 99)
      .then(({ data, error }) => {
        if (error) onError(mensajeError(error, 'No se pudieron cargar los datos.'))
        else {
          setRows(data as unknown as Record<string, unknown>[])
          setCount(count ?? 0)
        }
      })
  }, [table, companyId, page])
  const cells = (row: Record<string, unknown>): ReactNode[] => {
    if (table === 'clients') return [text(row.name), text(row.email), text(row.phone), text(row.document) || '—', text(row.address) || '—']
    if (table === 'items') return [
      text(row.name), text(row.supplier) || '—', text(row.unit) || '—',
      importeEnMoneda(Number(row.price), text(row.currency) || 'ARS'), row.active ? 'Activo' : 'Desactivado',
    ]
    const snapshot = row.client_snapshot as { nombre?: string } | null
    return [
      String(row.number).padStart(4, '0'), row.issue_date ? fechaCorta(String(row.issue_date)) : '—',
      snapshot?.nombre || 'Sin completar', text(row.seller_name) || '—',
      importeEnMoneda(Number(row.total), text(row.currency) || 'ARS'), text(row.status),
    ]
  }
  return <>
    <Table headers={tableHeaders[table]} empty="No hay registros." rows={rows?.map(cells) ?? null} />
    {count > 100 && <div className="botones">
      <button className="btn sec chico" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Anterior</button>
      <span className="ayuda">Página {page + 1} de {Math.ceil(count / 100)}</span>
      <button className="btn sec chico" disabled={(page + 1) * 100 >= count} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
    </div>}
  </>
}

function CompanyQuotes({ companyId, company, onError }: { companyId: string; company: Company; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Presupuesto[] | null>(null)
  const [summary, setSummary] = useState<{ mes: string; moneda: string; cantidad: number; presupuestado: number; aceptado: number; aceptados: number }[]>([])
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [generating, setGenerating] = useState<string | null>(null)
  useEffect(() => {
    setRows(null)
    supabase.from('quotes').select('*', { count: 'exact' }).eq('company_id', companyId)
      .order('number', { ascending: false }).range(page * 100, page * 100 + 99)
      .then(({ data, count: total, error }) => {
        if (error) onError(mensajeError(error, 'No se pudieron cargar los presupuestos.'))
        else {
          setCount(total ?? 0)
          setRows((data ?? []).map((r) => ({
            id: r.id, empresa: r.company_id, numero: r.number, estado: r.status as Estado,
            fechaEmision: r.issue_date ?? '', validezDias: r.validity_days ?? undefined,
            plazo: r.delivery_time, formaPago: r.payment_terms, notas: r.notes, ganancia: Number(r.profit),
            cliente: r.client_id ?? undefined, clienteDatos: r.client_snapshot as Presupuesto['clienteDatos'],
            lineas: r.lines as Linea[], vendedor: r.seller_id ?? undefined, vendedorNombre: r.seller_name,
            vendedorEmail: r.seller_email, total: Number(r.total), moneda: r.currency,
            cotizacionDolar: Number(r.exchange_rate), cotizacionFecha: r.exchange_rate_date,
            fechaRespuesta: r.answered_at ?? undefined, created: r.created_at, updated: r.updated_at,
          })))
        }
      })
  }, [companyId, page])
  useEffect(() => {
    const loadSummary = async () => {
      const byMonth = new Map<string, { mes: string; moneda: string; cantidad: number; presupuestado: number; aceptado: number; aceptados: number }>()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('quotes')
          .select('status,issue_date,created_at,total,currency')
          .eq('company_id', companyId).range(from, from + 999)
        if (error) throw error
        for (const quote of data) {
          if (quote.status === 'borrador') continue
          const mes = (quote.issue_date || quote.created_at).slice(0, 7)
          const moneda = normalizarMoneda(quote.currency)
          const key = `${mes}\0${moneda}`
          const current = byMonth.get(key) ?? { mes, moneda, cantidad: 0, presupuestado: 0, aceptado: 0, aceptados: 0 }
          current.cantidad++
          current.presupuestado += Number(quote.total)
          if (quote.status === 'aceptado') {
            current.aceptado += Number(quote.total)
            current.aceptados++
          }
          byMonth.set(key, current)
        }
        if (data.length < 1000) break
      }
      setSummary([...byMonth.values()].sort((a, b) => b.mes.localeCompare(a.mes) || a.moneda.localeCompare(b.moneda)))
    }
    loadSummary().catch((e: unknown) => onError(mensajeError(e, 'No se pudo calcular el resumen de presupuestos.')))
  }, [companyId])

  const descargar = async (quote: Presupuesto) => {
    setGenerating(quote.id); onError('')
    try {
      const empresa: EmpresaApp = {
        id: company.id, nombre: company.name, documento: company.document ?? undefined,
        email: company.email ?? undefined, telefono: company.phone ?? undefined, logo: company.logo_path ?? undefined,
        fuenteTitulosArchivo: company.title_font_path ?? undefined, fuenteTextoArchivo: company.text_font_path ?? undefined,
        colorPrimario: company.primary_color, colorAcento: company.accent_color,
        fuenteTitulos: company.title_font ?? undefined, fuenteTexto: company.text_font ?? undefined,
        validezDias: company.validity_days ?? undefined, condiciones: company.terms ?? undefined, mostrarSello: company.show_seal,
      }
      const blob = await generarPdf(quote, empresa)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nombreArchivo(quote); document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch (e) { onError(mensajeError(e, 'No se pudo generar el PDF.')) }
    finally { setGenerating(null) }
  }
  const latestMonth = summary[0]?.mes
  const latestSummary = summary.filter((row) => row.mes === latestMonth)
  const monthLabel = latestMonth
    ? new Date(`${latestMonth}-15`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : ''

  return <>
    {latestSummary.map((row) => <p className="ayuda" key={`${row.mes}-${row.moneda}`}>
      Último mes con actividad: <strong>{monthLabel} ({row.moneda})</strong> · {row.cantidad} presupuestos · presupuestado {importeEnMoneda(row.presupuestado, row.moneda)} · aceptado {importeEnMoneda(row.aceptado, row.moneda)} · conversión {Math.round((1000 * row.aceptados) / row.cantidad) / 10}%
    </p>)}
    <Table headers={['N°', 'Fecha', 'Cliente', 'Vendedor', 'Total', 'Estado', '']} empty="Esta empresa no tiene presupuestos." rows={rows?.map((row) => [
      String(row.numero).padStart(4, '0'),
      fechaCorta(row.fechaEmision || row.created),
      row.clienteDatos?.nombre || 'Sin completar',
      row.vendedorNombre || '—',
      importeEnMoneda(row.total, row.moneda),
      row.estado,
      <button className="link" disabled={generating === row.id} onClick={() => void descargar(row)}>{generating === row.id ? 'Generando…' : 'PDF'}</button>,
    ]) ?? null} />
    {count > 100 && <div className="botones">
      <button className="btn sec chico" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Anterior</button>
      <span className="ayuda">Página {page + 1} de {Math.ceil(count / 100)}</span>
      <button className="btn sec chico" disabled={(page + 1) * 100 >= count} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
    </div>}
  </>
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
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
