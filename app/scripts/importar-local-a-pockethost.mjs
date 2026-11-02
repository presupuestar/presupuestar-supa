import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import PocketBase from 'pocketbase'

const BASE = 'https://presupuestar-sy.pockethost.io'
const appDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(appDir, '..', '..')
const pbDataDir = path.join(projectDir, 'pb', 'pb_data')
const dbPath = path.join(pbDataDir, 'data.db')
const storageDir = path.join(pbDataDir, 'storage')
const stateDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'PresupuestAR', 'pockethost-import')
const stateFile = path.join(stateDir, 'state.json')
const mappingsFile = path.join(stateDir, 'mappings.ndjson')
const documentsDir = path.join(os.homedir(), 'Documents')
let credentialsCsv
const collectionNames = ['empresa', 'users', 'items', 'clientes', 'presupuestos']
const concurrency = { empresa: 2, users: 2, items: 8, clientes: 4, presupuestos: 1 }
const maps = new Map(collectionNames.map((name) => [name, new Map()]))

const abort = (message) => { throw new Error(message) }

function readLocalData() {
  if (!existsSync(dbPath)) abort(`No se encontró la base local: ${dbPath}`)

  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const collectionRows = db.prepare('SELECT id, name, fields FROM _collections').all()
    const collections = new Map(collectionRows.map((row) => [row.name, {
      id: row.id,
      fields: JSON.parse(row.fields),
    }]))
    const data = new Map()

    for (const name of collectionNames) {
      const collection = collections.get(name)
      if (!collection) abort(`La base local no contiene la colección ${name}.`)
      data.set(name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())
    }

    data.get('presupuestos').sort((a, b) =>
      a.empresa.localeCompare(b.empresa) || Number(a.numero) - Number(b.numero))

    return { collections, data }
  } finally {
    db.close()
  }
}

function parseStoredValue(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function fileNames(value) {
  const parsed = parseStoredValue(value)
  if (Array.isArray(parsed)) return parsed.filter((name) => typeof name === 'string' && name)
  return typeof parsed === 'string' && parsed ? [parsed] : []
}

function validateLocalFiles(local) {
  let checked = 0
  for (const name of collectionNames) {
    const collection = local.collections.get(name)
    const fileFields = collection.fields.filter((field) => field.type === 'file')
    for (const record of local.data.get(name)) {
      for (const field of fileFields) {
        for (const filename of fileNames(record[field.name])) {
          if (path.basename(filename) !== filename) {
            abort(`Nombre de archivo local no válido en ${name}.${field.name}; no se inició ninguna importación.`)
          }
          const source = path.join(storageDir, collection.id, record.id, filename)
          if (!existsSync(source)) {
            abort(`Falta un archivo adjunto local en ${name}.${field.name}; no se inició ninguna importación.`)
          }
          checked++
        }
      }
    }
  }
  return checked
}

function atomicWrite(file, content) {
  const temp = `${file}.tmp`
  writeFileSync(temp, content, { mode: 0o600 })
  renameSync(temp, file)
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function loadMappings() {
  if (!existsSync(mappingsFile)) return 0
  const lines = readFileSync(mappingsFile, 'utf8').split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    const { collection, oldId, newId } = JSON.parse(line)
    if (!maps.has(collection) || !oldId || !newId) abort('El archivo de progreso local está incompleto; no se importó nada más.')
    maps.get(collection).set(oldId, newId)
  }
  return lines.length
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

function remapRelation(value, map, fieldName) {
  if (!value) return value
  if (Array.isArray(value)) {
    return value.map((id) => {
      const mapped = map.get(id)
      if (!mapped) abort(`No se pudo vincular ${fieldName}; no se continuará para evitar perder relaciones.`)
      return mapped
    })
  }
  const mapped = map.get(value)
  if (!mapped) abort(`No se pudo vincular ${fieldName}; no se continuará para evitar perder relaciones.`)
  return mapped
}

function makePayload(name, record, collection, local, userPassword) {
  const payload = new FormData()
  const relatedMaps = {
    empresa: maps.get('empresa'),
    cliente: maps.get('clientes'),
    vendedor: maps.get('users'),
  }

  for (const field of collection.fields) {
    const fieldName = field.name
    if (fieldName === 'id' || fieldName === 'password' || fieldName === 'tokenKey' || field.type === 'autodate') continue

    let value = record[fieldName]
    if (value === null || value === undefined || value === '') continue

    if (field.type === 'file') {
      for (const filename of fileNames(value)) {
        const localFile = path.join(storageDir, collection.id, record.id, filename)
        const bytes = readFileSync(localFile)
        payload.append(fieldName, new File([bytes], filename, { type: mediaType(filename) }))
      }
      continue
    }

    if (field.type === 'relation') {
      value = remapRelation(value, relatedMaps[fieldName], fieldName)
    } else if (field.type === 'json') {
      value = parseStoredValue(value)
      if (fieldName === 'lineas' && Array.isArray(value)) {
        value = value.map((line) => {
          if (!line?.itemId) return line
          const itemId = maps.get('items').get(line.itemId)
          return itemId ? { ...line, itemId } : line
        })
      }
    } else if (field.type === 'bool') {
      value = Boolean(Number(value))
    }

    payload.append(fieldName, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }

  if (name === 'users') {
    payload.append('password', userPassword)
    payload.append('passwordConfirm', userPassword)
  }

  return payload
}

async function createRecord(name, record, collection, local, password, token) {
  const response = await fetch(`${BASE}/api/collections/${encodeURIComponent(name)}/records`, {
    method: 'POST',
    headers: { Authorization: token },
    body: makePayload(name, record, collection, local, password),
    signal: AbortSignal.timeout(90_000),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const fields = Object.entries(result.data || {}).map(([field, error]) =>
      `${field}: ${error.message}`).join('; ')
    abort(`PocketBase rechazó un registro de ${name}: ${result.message || `HTTP ${response.status}`}${fields ? ` (${fields})` : ''}`)
  }

  return result
}

async function requestJson(pathname, token, method = 'GET', body) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      Authorization: token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) abort(`PocketBase respondió HTTP ${response.status}: ${result.message || 'error de API'}`)
  return result
}

async function remoteCount(pb, name) {
  return (await pb.collection(name).getList(1, 1, { fields: 'id' })).totalItems
}

function saveMapping(name, oldId, newId) {
  appendFileSync(mappingsFile, `${JSON.stringify({ collection: name, oldId, newId })}\n`, { mode: 0o600 })
  maps.get(name).set(oldId, newId)
}

async function importCollection(name, local, credentials, token) {
  const rows = local.data.get(name)
  const collection = local.collections.get(name)
  const mapping = maps.get(name)
  let completed = mapping.size
  let cursor = 0

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= rows.length) return
      const record = rows[index]
      if (mapping.has(record.id)) continue

      const password = name === 'users' ? credentials[record.id] : undefined
      const result = await createRecord(name, record, collection, local, password, token)
      saveMapping(name, record.id, result.id)
      completed++

      if (completed % 100 === 0 || completed === rows.length) {
        console.log(`${name}: ${completed}/${rows.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency[name], rows.length) }, worker))
}

async function main() {
  const local = readLocalData()
  const localCounts = Object.fromEntries(collectionNames.map((name) => [name, local.data.get(name).length]))
  const localTime = existsSync(dbPath) ? (await import('node:fs')).statSync(dbPath).mtimeMs : 0
  const attachments = validateLocalFiles(local)

  if (process.argv.includes('--dry-run')) {
    console.log('Inventario local validado (no se conectó ni modificó PocketHost):')
    for (const name of collectionNames) console.log(`${name}: ${localCounts[name]}`)
    console.log(`Archivos adjuntos encontrados: ${attachments}`)
    return
  }

  const email = process.env.PB_SUPER_EMAIL
  const password = process.env.PB_SUPER_PASS
  if (!email || !password) abort('Faltan credenciales del superusuario; ejecutá el script de PowerShell incluido.')

  mkdirSync(stateDir, { recursive: true })
  mkdirSync(documentsDir, { recursive: true })

  const pb = new PocketBase(BASE)
  pb.autoCancellation(false)
  const auth = await pb.collection('_superusers').authWithPassword(email, password)
  const token = auth.token
  const mappingCount = loadMappings()

  let state
  if (existsSync(stateFile)) {
    state = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (state.base !== BASE || state.localTime !== localTime) {
      abort('El estado de migración pertenece a otra instancia o cambió la base local; se detuvo por seguridad.')
    }
    credentialsCsv = state.credentialsCsv
  } else {
    if (mappingCount > 0) abort('Hay un archivo de progreso sin estado; no se importó nada más.')
    for (const name of collectionNames) {
      const count = await remoteCount(pb, name)
      if (count !== 0) abort(`La colección remota ${name} ya tiene ${count} registros; no se importó nada para evitar duplicados.`)
    }
    const userRows = local.data.get('users')
    const credentials = Object.fromEntries(userRows.map((user) => [user.id, randomBytes(18).toString('base64url')]))
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    credentialsCsv = path.join(documentsDir, `PresupuestAR-usuarios-temporales-${timestamp}.csv`)
    state = {
      base: BASE,
      localTime,
      localCounts,
      credentialsCsv,
      startedAt: new Date().toISOString(),
    }
    atomicWrite(stateFile, JSON.stringify(state, null, 2))

    const companyNames = new Map(local.data.get('empresa').map((company) => [company.id, company.nombre]))
    const csv = [
      ['id local', 'empresa', 'nombre', 'correo', 'contraseña temporal'].map(csvCell).join(','),
      ...userRows.map((user) => [
        user.id,
        companyNames.get(user.empresa) || '',
        user.name || '',
        user.email || '',
        credentials[user.id],
      ].map(csvCell).join(',')),
    ].join('\r\n') + '\r\n'
    atomicWrite(credentialsCsv, csv)
  }

  if (!credentialsCsv || !existsSync(credentialsCsv)) {
    abort('No se encontró el CSV local de claves temporales; no se continuó.')
  }
  const credentialRows = parseCsv(readFileSync(credentialsCsv, 'utf8'))
  const credentialHeaders = credentialRows.shift() || []
  const idColumn = credentialHeaders.indexOf('id local')
  const passwordColumn = credentialHeaders.indexOf('contraseña temporal')
  if (idColumn < 0 || passwordColumn < 0) abort('El CSV de claves temporales no tiene las columnas esperadas.')
  const credentials = Object.fromEntries(credentialRows.map((row) => [row[idColumn], row[passwordColumn]]))
  if (local.data.get('users').some((user) => !credentials[user.id])) {
    abort('Al CSV le faltan claves temporales para algunos usuarios; no se continuó.')
  }

  for (const name of collectionNames) {
    const remote = await remoteCount(pb, name)
    const mapped = maps.get(name).size
    if (remote !== mapped) {
      abort(`La colección remota ${name} tiene ${remote} registros y el progreso local registra ${mapped}. No se continuó para evitar duplicados; hace falta revisar el estado antes de reintentar.`)
    }
  }

  console.log(`Destino validado. ${attachments} archivos adjuntos locales encontrados.`)
  for (const name of collectionNames) await importCollection(name, local, credentials, token)

  const budgetMap = maps.get('presupuestos')
  for (const record of local.data.get('presupuestos')) {
    const id = budgetMap.get(record.id)
    const remote = await requestJson(`/api/collections/presupuestos/records/${id}`, token)
    const numero = Number(record.numero) || 0
    if (Number(remote.numero) !== numero) {
      await requestJson(`/api/collections/presupuestos/records/${id}`, token, 'PATCH', { numero })
    }
  }

  for (const name of collectionNames) {
    const remote = await remoteCount(pb, name)
    if (remote !== localCounts[name]) {
      abort(`Validación final incompleta en ${name}: local ${localCounts[name]}, remoto ${remote}. El progreso se conserva para revisar.`)
    }
  }

  rmSync(stateDir, { recursive: true, force: true })
  console.log('Importación y validación completadas.')
  for (const name of collectionNames) console.log(`${name}: ${localCounts[name]}`)
  console.log(`Claves temporales guardadas en: ${credentialsCsv}`)
  console.log('La base local no se modificó. Los usuarios migrados deben recibir su clave temporal de forma privada.')
}

main().catch((error) => {
  console.error(`Importación detenida: ${error.message}`)
  process.exitCode = 1
})
