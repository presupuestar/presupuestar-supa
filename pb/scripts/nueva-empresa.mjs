// Alta de una empresa nueva con su primer usuario administrador.
//
// Uso (PocketBase tiene que estar corriendo):
//   $env:PB_SUPER_EMAIL = 'tu-superusuario@correo.com'
//   $env:PB_SUPER_PASS  = 'TuClaveDeSuperusuario'
//   node scripts/nueva-empresa.mjs "Nombre de la empresa" usuario@empresa.com "ClaveDelUsuario" [--color "#1B7F5C"] [--acento "#8FD9B8"]
//
// Opcional: $env:PB_URL = 'http://127.0.0.1:8090'
const args = process.argv.slice(2)
const flag = (nombre) => { const i = args.indexOf(nombre); return i >= 0 ? args.splice(i, 2)[1] : undefined }
const color = flag('--color'), acento = flag('--acento')
const [nombre, email, clave] = args
const BASE = process.env.PB_URL ?? 'http://127.0.0.1:8090'

const salir = (msg) => { console.error('Error: ' + msg); process.exit(1) }
if (!nombre || !email || !clave) salir('faltan datos. Uso: node scripts/nueva-empresa.mjs "Empresa" usuario@correo.com "Clave" [--color "#RRGGBB"] [--acento "#RRGGBB"]')
if (clave.length < 8) salir('la clave del usuario necesita al menos 8 caracteres.')
if (!process.env.PB_SUPER_EMAIL || !process.env.PB_SUPER_PASS) salir('definí PB_SUPER_EMAIL y PB_SUPER_PASS con las credenciales del superusuario.')
for (const [n, c] of [['--color', color], ['--acento', acento]]) if (c && !/^#[0-9A-Fa-f]{6}$/.test(c)) salir(`${n} tiene que ser un color como #1B7F5C.`)

async function pb(ruta, cuerpo, token) {
  const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: JSON.stringify(cuerpo) })
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) {
    const campos = Object.entries(datos.data ?? {}).map(([k, v]) => `${k}: ${v.message}`).join(' · ')
    throw new Error(`${datos.message ?? 'error ' + r.status}${campos ? ' (' + campos + ')' : ''}`)
  }
  return datos
}

try {
  const { token } = await pb('/api/collections/_superusers/auth-with-password', { identity: process.env.PB_SUPER_EMAIL, password: process.env.PB_SUPER_PASS })
  const empresa = await pb('/api/collections/empresa/records', {
    nombre, colorPrimario: color ?? '#0B2545', colorAcento: acento ?? '#5BB5F0', fuenteTitulos: 'Poppins', fuenteTexto: 'Poppins',
    validezDias: 15, condiciones: 'Precios expresados en pesos argentinos.', mostrarSello: true,
  }, token)
  try {
    await pb('/api/collections/users/records', { email, password: clave, passwordConfirm: clave, verified: true, empresa: empresa.id, rol: 'admin' }, token)
  } catch (e) {
    salir(`la empresa "${nombre}" se creó, pero no el usuario: ${e.message}. Creá el usuario desde el panel (Collections → users).`)
  }
  console.log(`Listo. Empresa "${nombre}" creada, con el usuario administrador ${email}.`)
  console.log('Para completar su marca (logo, tipografías) editá el registro en el panel: Collections → empresa.')
} catch (e) {
  salir(e.message.includes('fetch failed') ? `no se pudo conectar con PocketBase en ${BASE}. ¿Está corriendo?` : e.message)
}
