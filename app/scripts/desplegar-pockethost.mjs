import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectDir = path.resolve(appDir, '..')
const target = process.argv[2]
const remoteRoot = process.argv[3] || 'presupuestar-sy'

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!target || !/^[\w.@:-]+$/.test(target)) {
  fail('Uso: npm run deploy:pockethost -- <destino-sftp> [carpeta-remota]\nEl destino debe ser un alias SSH o usuario@host, sin contraseña.')
}
if (!/^[\w./-]+$/.test(remoteRoot) || remoteRoot.startsWith('/') || (remoteRoot !== '.' && remoteRoot.split('/').some((parte) => !parte || parte === '.' || parte === '..'))) {
  fail('La carpeta remota debe ser relativa a la carpeta inicial SFTP y no puede contener segmentos "." o "..".')
}

const buildDir = path.join(appDir, 'dist')
const hooksDir = path.join(projectDir, 'pb', 'pb_hooks')
const migrationsDir = path.join(projectDir, 'pb', 'pb_migrations')
for (const directory of [buildDir, path.join(buildDir, 'assets'), path.join(buildDir, 'fonts'), hooksDir, migrationsDir]) {
  if (!existsSync(directory)) fail(`No existe ${directory}. La compilación debe completarse antes de publicar.`)
}

const sftpPath = (value) => value.replace(/\\/g, '/').replace(/"/g, '\\"')
const archivosEn = (directorio, prefijo) => readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
  const local = path.join(directorio, entrada.name)
  return entrada.isDirectory()
    ? archivosEn(local, `${prefijo}/${entrada.name}`)
    : [{ local, relativo: `${prefijo}/${entrada.name}` }]
})
const archivos = [
  ...archivosEn(hooksDir, 'pb_hooks'),
  ...archivosEn(migrationsDir, 'pb_migrations'),
  ...archivosEn(path.join(buildDir, 'assets'), 'pb_public/assets'),
  ...archivosEn(path.join(buildDir, 'fonts'), 'pb_public/fonts'),
  { local: path.join(buildDir, 'favicon.svg'), relativo: 'pb_public/favicon.svg' },
  { local: path.join(buildDir, 'index.html'), relativo: 'pb_public/index.html' },
]
const directorios = [...new Set(archivos.flatMap((archivo) => {
  const partes = archivo.relativo.split('/')
  return partes.slice(0, -1).map((_, index) => partes.slice(0, index + 1).join('/'))
}))].sort((a, b) => a.split('/').length - b.split('/').length)
const commands = [
  `cd "${sftpPath(remoteRoot)}"`,
  ...directorios.map((directorio) => `-mkdir "${directorio}"`),
  ...archivos.filter((archivo) => !archivo.relativo.endsWith('/index.html') && archivo.relativo !== 'pb_public/index.html')
    .map((archivo) => `put "${sftpPath(archivo.local)}" "${archivo.relativo}"`),
  ...archivos.filter((archivo) => archivo.relativo === 'pb_public/index.html')
    .map((archivo) => `put "${sftpPath(archivo.local)}" "${archivo.relativo}"`),
]

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'presupuestar-sftp-'))
const batchFile = path.join(tempDir, 'deploy.txt')
try {
  writeFileSync(batchFile, `${commands.join('\n')}\n`, { encoding: 'utf8' })
  console.log(`Publicando en ${target}:${remoteRoot} usando OpenSSH SFTP...`)
  const result = await new Promise((resolve, reject) => {
    const child = spawn('sftp', ['-b', batchFile, target], { stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  if (result.signal) fail(`SFTP se interrumpió por la señal ${result.signal}.`)
  if (result.code !== 0) fail(`La publicación por SFTP terminó con código ${result.code}.`)
  console.log('Archivos publicados. Reiniciá PocketBase desde PocketHost para aplicar los hooks y las migraciones.')
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    fail('No se encontró OpenSSH sftp. Instalá/activá OpenSSH Client en las características opcionales de Windows.')
  }
  throw error
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
