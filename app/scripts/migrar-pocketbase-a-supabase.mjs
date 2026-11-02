import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..', '..')
const dbPath = path.join(projectDir, 'pb', 'pb_data', 'data.db')
const storageDir = path.join(projectDir, 'pb', 'pb_data', 'storage')
const stateDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'PresupuestAR', 'supabase-import')
const statePath = path.join(stateDir, 'state.json')
const collectionNames = ['empresa', 'users', 'items', 'clientes', 'presupuestos']
const targetTables = ['companies', 'items', 'clients', 'quotes']
const batchSize = 250

const abort = (message) => { throw new Error(message) }

function readEnvFile(filename) {
  const values = {}
  if (!existsSync(filename)) return values
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) values[match[1].trim()] = match[2].trim()
  }
  return values
}

function readConfig() {
  const values = {
    ...readEnvFile(path.join(projectDir, 'supabase', '.env')),
    ...readEnvFile(path.join(projectDir, 'supabase', '.env.local')),
  }
  const url = values.SUPABASE_URL?.replace(/\/+$/, '')
  const key = values.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || /^(PEGA_AQUI|YOUR_)/i.test(key)) {
    abort('Completá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en supabase/.env.local.')
  }
  return { url, key }
}

function readLocalData() {
  if (!existsSync(dbPath)) abort(`No se encontró la base local: ${dbPath}`)
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const collections = new Map(db.prepare('SELECT name, fields FROM _collections').all()
      .map((row) => [row.name, JSON.parse(row.fields)]))
    const data = new Map()
    for (const name of collectionNames) {
      if (!collections.has(name)) abort(`La base local no contiene la colección ${name}.`)
      data.set(name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())
    }
    return { collections, data, modified: String(statSync(dbPath).mtimeMs) }
  } finally {
    db.close()
  }
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function boolean(value) {
  return value === true || value === 1 || value === '1'
}

function timestamp(value) {
  if (!value) return null
  let result = String(value).trim().replace(' ', 'T')
  if (!/[zZ]|[+-]\d\d:\d\d$/.test(result)) result += 'Z'
  return result
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null
}

function assertLocalData(local) {
  const companies = local.data.get('empresa')
  const companyIds = new Set(companies.map((row) => row.id))
  const users = local.data.get('users')
  const userIds = new Set(users.map((row) => row.id))
  if (!companies.length) abort('PocketBase no tiene empresas para migrar.')

  for (const user of users) {
    if (!user.email || !companyIds.has(user.empresa)) {
      abort(`Hay un usuario sin correo o empresa válida (${user.id}); no se inició la importación.`)
    }
  }
  for (const collection of ['items', 'clientes', 'presupuestos']) {
    for (const record of local.data.get(collection)) {
      if (!companyIds.has(record.empresa)) {
        abort(`Hay un registro de ${collection} sin empresa válida (${record.id}); no se inició la importación.`)
      }
    }
  }
  for (const quote of local.data.get('presupuestos')) {
    if (quote.vendedor && !userIds.has(quote.vendedor)) {
      abort(`El presupuesto ${quote.id} referencia un vendedor inexistente; no se inició la importación.`)
    }
  }

  let attachments = 0
  for (const name of collectionNames) {
    const fields = local.collections.get(name)
    for (const field of fields.filter((item) => item.type === 'file')) {
      for (const record of local.data.get(name)) {
        const files = parseJson(record[field.name], record[field.name])
        const filenames = Array.isArray(files) ? files : typeof files === 'string' && files ? [files] : []
        for (const filename of filenames) {
          if (path.basename(filename) !== filename) abort(`Archivo adjunto no válido en ${name}.${field.name}.`)
          const collectionId = readCollectionId(name)
          if (!existsSync(path.join(storageDir, collectionId, record.id, filename))) {
            abort(`Falta un archivo adjunto local en ${name}.${field.name}; no se inició la importación.`)
          }
          attachments++
        }
      }
    }
  }
  return attachments
}

let collectionIds
function readCollectionId(name) {
  if (collectionIds?.has(name)) return collectionIds.get(name)
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    collectionIds = new Map(db.prepare('SELECT name, id FROM _collections').all().map((row) => [row.name, row.id]))
  } finally {
    db.close()
  }
  return collectionIds.get(name)
}

function mapCompany(record, quotes) {
  const maxQuoteNumber = quotes.reduce((max, quote) =>
    quote.empresa === record.id ? Math.max(max, Number(quote.numero) || 0) : max, 0)
  return {
    id: record.id,
    name: record.nombre,
    document: record.documento || null,
    email: record.email || null,
    phone: record.telefono || null,
    primary_color: record.colorPrimario,
    accent_color: record.colorAcento,
    title_font: record.fuenteTitulos || null,
    text_font: record.fuenteTexto || null,
    validity_days: Number(record.validezDias) || null,
    terms: record.condiciones || null,
    show_seal: boolean(record.mostrarSello),
    next_quote_number: maxQuoteNumber + 1,
    created_at: timestamp(record.created),
    updated_at: timestamp(record.updated),
  }
}

function mapItem(record) {
  return {
    id: record.id,
    company_id: record.empresa,
    name: record.nombre,
    description: record.descripcion || '',
    supplier: record.proveedor || '',
    unit: record.unidad || '',
    price: Number(record.precio) || 0,
    currency: record.moneda || 'ARS',
    active: boolean(record.activo),
    created_at: timestamp(record.created),
    updated_at: timestamp(record.updated),
  }
}

function mapClient(record) {
  return {
    id: record.id,
    company_id: record.empresa,
    name: record.nombre,
    email: record.email,
    phone: record.telefono,
    document: record.documento || '',
    address: record.direccion || '',
    created_at: timestamp(record.created),
    updated_at: timestamp(record.updated),
  }
}

function mapQuote(record, authIds) {
  const lines = parseJson(record.lineas, [])
  const snapshot = parseJson(record.clienteDatos, {})
  return {
    id: record.id,
    company_id: record.empresa,
    number: Number(record.numero) || 1,
    status: record.estado,
    issue_date: dateOnly(record.fechaEmision),
    validity_days: Number(record.validezDias) || null,
    delivery_time: record.plazo || '',
    payment_terms: record.formaPago || '',
    notes: record.notas || '',
    client_id: record.cliente || null,
    client_snapshot: snapshot,
    lines,
    total: Number(record.total) || 0,
    answered_at: timestamp(record.fechaRespuesta),
    profit: Number(record.ganancia) || 0,
    currency: record.moneda || 'ARS',
    exchange_rate: Number(record.cotizacionDolar) || 0,
    exchange_rate_date: record.cotizacionFecha || '',
    seller_id: record.vendedor ? authIds.get(record.vendedor) : null,
    seller_name: record.vendedorNombre || '',
    seller_email: record.vendedorEmail || '',
    created_at: timestamp(record.created),
    updated_at: timestamp(record.updated),
  }
}

async function request(config, pathname, options = {}) {
  const response = await fetch(`${config.url}${pathname}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(90_000),
  })
  const body = await response.text()
  if (!response.ok) {
    let message = body
    try {
      const parsed = JSON.parse(body)
      message = parsed.msg || parsed.message || parsed.error_description || parsed.error || body
    } catch { /* La respuesta no es JSON; se conserva el texto HTTP. */ }
    abort(`Supabase respondió HTTP ${response.status}: ${message}`)
  }
  return body ? JSON.parse(body) : null
}

async function rest(config, table, rows, conflictColumn = 'id') {
  if (!rows.length) return
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
    await request(config, `/rest/v1/${table}?on_conflict=${conflictColumn}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    })
    console.log(`${table}: ${Math.min(start + batchSize, rows.length)} de ${rows.length} procesados`)
  }
}

async function targetCount(config, table) {
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Prefer: 'count=exact' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const body = await response.text()
    abort(`No se pudo validar la tabla ${table} en Supabase (HTTP ${response.status}): ${body}`)
  }
  const range = response.headers.get('content-range')
  return Number(range?.split('/')[1] || 0)
}

async function targetIds(config, table, column = 'id') {
  const ids = []
  for (let offset = 0; ; offset += 1000) {
    const rows = await request(config, `/rest/v1/${table}?select=${column}&order=${column}&limit=1000&offset=${offset}`)
    ids.push(...rows.map((row) => row[column]))
    if (rows.length < 1000) return ids
  }
}

async function listAuthUsers(config) {
  const users = []
  for (let page = 1; ; page++) {
    const result = await request(config, `/auth/v1/admin/users?page=${page}&per_page=500`)
    users.push(...(result.users || []))
    if (!result.users?.length || (result.total != null && users.length >= Number(result.total))) break
  }
  return users
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function atomicJson(filename, value) {
  const temporary = `${filename}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(temporary, filename)
}

function mediaType(filename) {
  const ext = path.extname(filename).toLowerCase()
  return ({
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  })[ext] || 'application/octet-stream'
}

async function uploadCompanyAssets(config, local) {
  const fields = local.collections.get('empresa').filter((field) => field.type === 'file')
  const recordById = new Map(local.data.get('empresa').map((company) => [company.id, company]))
  const updates = new Map()
  const collectionId = readCollectionId('empresa')

  for (const [fieldName, columnName] of [
    ['logo', 'logo_path'],
    ['fuenteTitulosArchivo', 'title_font_path'],
    ['fuenteTextoArchivo', 'text_font_path'],
  ]) {
    if (!fields.some((field) => field.name === fieldName)) continue
    for (const company of local.data.get('empresa')) {
      const value = recordById.get(company.id)[fieldName]
      const parsed = parseJson(value, value)
      const filenames = Array.isArray(parsed) ? parsed : typeof parsed === 'string' && parsed ? [parsed] : []
      for (const filename of filenames) {
        const objectPath = `${company.id}/${fieldName}/${filename}`
        const bytes = readFileSync(path.join(storageDir, collectionId, company.id, filename))
        await request(config, `/storage/v1/object/company-assets/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'POST',
          headers: { 'Content-Type': mediaType(filename), 'x-upsert': 'true' },
          body: bytes,
        })
        const row = updates.get(company.id) || { id: company.id }
        row[columnName] = objectPath
        updates.set(company.id, row)
      }
    }
  }
  for (const [companyId, data] of updates) {
    const { id, ...assetPaths } = data
    await request(config, `/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(assetPaths),
    })
  }
}

async function createOrMatchUsers(config, local, authUsers, state) {
  const byEmail = new Map(authUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user]))
  const credentialsPath = state.credentialsPath
  const credentials = state.credentials || {}
  const authIds = new Map(Object.entries(state.authIds || {}))
  const companyById = new Map(local.data.get('empresa').map((company) => [company.id, company]))
  const userRows = local.data.get('users')

  for (let index = 0; index < userRows.length; index++) {
    const user = userRows[index]
    if (authIds.has(user.id)) continue
    const existing = byEmail.get(user.email.toLowerCase())
    let authUser = existing

    if (!authUser) {
      const password = credentials[user.id] || randomBytes(24).toString('base64url')
      credentials[user.id] = password
      state.credentials = credentials
      atomicJson(statePath, state)
      authUser = await request(config, '/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          password,
          email_confirm: true,
          app_metadata: {
            company_id: user.empresa,
            role: user.rol === 'admin' ? 'admin' : 'member',
          },
          user_metadata: { name: user.name || '' },
        }),
      })
      byEmail.set(user.email.toLowerCase(), authUser)
    } else {
      authUser = await request(config, `/auth/v1/admin/users/${authUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          app_metadata: {
            ...(authUser.app_metadata || {}),
            company_id: user.empresa,
            role: user.rol === 'admin' ? 'admin' : 'member',
          },
          user_metadata: { ...(authUser.user_metadata || {}), name: user.name || '' },
        }),
      })
    }

    const company = companyById.get(user.empresa)
    if (!company) abort(`No se encontró empresa para el usuario ${user.id}.`)
    authIds.set(user.id, authUser.id)
    state.authIds = Object.fromEntries(authIds)
    atomicJson(statePath, state)
    await rest(config, 'profiles', [{
      user_id: authUser.id,
      company_id: user.empresa,
      role: user.rol === 'admin' ? 'admin' : 'member',
      name: user.name || '',
      email: user.email,
      first_access_password_answered: false,
      created_at: timestamp(user.created),
      updated_at: timestamp(user.updated),
    }], 'user_id')
    console.log(`usuarios: ${index + 1} de ${userRows.length} procesados`)
  }

  if (Object.keys(credentials).length) {
    const documents = path.join(os.homedir(), 'Documents')
    mkdirSync(documents, { recursive: true })
    const companyNames = new Map(local.data.get('empresa').map((company) => [company.id, company.nombre]))
    const newlyCreated = userRows.filter((user) => credentials[user.id])
    const csv = [
      ['empresa', 'nombre', 'correo', 'contraseña temporal'].map(csvCell).join(','),
      ...newlyCreated.map((user) => [
        companyNames.get(user.empresa) || '',
        user.name || '',
        user.email,
        credentials[user.id],
      ].map(csvCell).join(',')),
    ].join('\r\n') + '\r\n'
    writeFileSync(credentialsPath, csv, { mode: 0o600 })
    state.credentials = {}
    atomicJson(statePath, state)
  }
  return authIds
}

async function validateDestination(config, local, state) {
  const ownerCount = await targetCount(config, 'platform_owners')
  if (ownerCount < 1) abort('No hay propietario en platform_owners. Registrá primero la cuenta propietaria.')
  const authUsers = await listAuthUsers(config)
  const ownerRows = await request(config, '/rest/v1/platform_owners?select=user_id')
  const ownerIds = new Set(ownerRows.map((owner) => owner.user_id))
  const profiles = await request(config, '/rest/v1/profiles?select=user_id,company_id')
  const sourceIds = {
    companies: new Set(local.data.get('empresa').map((row) => row.id)),
    items: new Set(local.data.get('items').map((row) => row.id)),
    clients: new Set(local.data.get('clientes').map((row) => row.id)),
    quotes: new Set(local.data.get('presupuestos').map((row) => row.id)),
  }

  if (!state) {
    for (const table of targetTables) {
      const count = await targetCount(config, table)
      if (count !== 0) abort(`La tabla ${table} ya contiene ${count} registros; no se importó nada para evitar duplicados.`)
    }
    if (profiles.some((profile) => !ownerIds.has(profile.user_id) || profile.company_id)) {
      abort('Hay perfiles que no son propietarios sin empresa en el destino. No se importó nada.')
    }
  } else {
    for (const table of targetTables) {
      const ids = await targetIds(config, table)
      if (ids.some((id) => !sourceIds[table].has(id))) {
        abort(`La tabla ${table} contiene registros ajenos a esta importación. Se detuvo para proteger esos datos.`)
      }
    }
    const usersByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user]))
    const knownUserIds = new Set([...ownerIds, ...Object.values(state.authIds || {})])
    for (const sourceUser of local.data.get('users')) {
      const matched = usersByEmail.get(sourceUser.email.toLowerCase())
      if (matched) knownUserIds.add(matched.id)
    }
    if (profiles.some((profile) => !knownUserIds.has(profile.user_id))) {
      abort('Hay perfiles ajenos al estado de importación. Se detuvo para proteger esos datos.')
    }
  }

  if (authUsers.some((user) => !user.email)) abort('Supabase Auth contiene cuentas sin correo y no se puede validar duplicados.')
  return { authUsers, ownerProfileIds: ownerIds }
}

async function main() {
  const config = readConfig()
  const local = readLocalData()
  const attachments = assertLocalData(local)
  const counts = Object.fromEntries(collectionNames.map((name) => [name, local.data.get(name).length]))
  let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null
  if (state && (state.sourceModified !== local.modified || state.projectUrl !== config.url)) {
    abort('El estado de importación pertenece a otra base local o proyecto; no se continuó.')
  }
  const { authUsers, ownerProfileIds } = await validateDestination(config, local, state)

  console.log('PocketBase validado (solo lectura):')
  for (const name of collectionNames) console.log(`${name}: ${counts[name]}`)
  console.log(`Archivos adjuntos: ${attachments}`)
  console.log(`Cuentas Auth existentes preservadas: ${authUsers.length}`)
  console.log(state
    ? 'Destino Supabase: ya contiene datos de esta migración, se validó que no haya registros ajenos.'
    : 'Destino Supabase: tablas vacías, salvo la cuenta propietaria y su perfil.')

  if (process.argv.includes('--dry-run')) {
    console.log('Vista previa únicamente: no se creó ningún usuario, archivo ni registro.')
    return
  }
  if (!process.argv.includes('--apply')) {
    abort('La vista previa terminó. Para confirmar la transferencia, ejecutá el comando con --apply.')
  }

  mkdirSync(stateDir, { recursive: true })
  const documents = path.join(os.homedir(), 'Documents')
  mkdirSync(documents, { recursive: true })
  if (!state) {
    const timestamped = new Date().toISOString().replace(/[:.]/g, '-')
    state = {
      sourceModified: local.modified,
      projectUrl: config.url,
      authIds: {},
      credentials: {},
      credentialsPath: path.join(documents, `PresupuestAR-Supabase-claves-temporales-${timestamped}.csv`),
    }
    atomicJson(statePath, state)
  }

  const quoteRows = local.data.get('presupuestos')
  await rest(config, 'companies', local.data.get('empresa').map((company) => mapCompany(company, quoteRows)))
  await uploadCompanyAssets(config, local)
  const latestAuthUsers = await listAuthUsers(config)
  const authIds = await createOrMatchUsers(config, local, latestAuthUsers, state)
  await rest(config, 'items', local.data.get('items').map(mapItem))
  await rest(config, 'clients', local.data.get('clientes').map(mapClient))
  await rest(config, 'quotes', quoteRows.map((record) => mapQuote(record, authIds)))

  const expectedProfileIds = new Set(ownerProfileIds)
  for (const userId of authIds.values()) expectedProfileIds.add(userId)
  for (const [table, expected] of [
    ['companies', counts.empresa],
    ['profiles', expectedProfileIds.size],
    ['items', counts.items],
    ['clients', counts.clientes],
    ['quotes', counts.presupuestos],
  ]) {
    const actual = await targetCount(config, table)
    if (actual !== expected) abort(`Validación final incompleta en ${table}: esperado ${expected}, recibido ${actual}. El progreso local se conservó.`)
    console.log(`${table}: ${actual} registros verificados`)
  }
  console.log('Importación y validación completadas. PocketBase permaneció intacto.')
  if (state.credentialsPath && existsSync(state.credentialsPath)) {
    console.log(`Claves temporales guardadas localmente en: ${state.credentialsPath}`)
  }
}

main().catch((error) => {
  console.error(`Importación detenida: ${error.message}`)
  process.exitCode = 1
})
