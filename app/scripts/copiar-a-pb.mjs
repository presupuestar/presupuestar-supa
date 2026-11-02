// Copia la app compilada (dist) a pb/pb_public: PocketBase la sirve en la misma dirección que la API,
// así se publica todo con un solo programa.
import { cpSync, existsSync, rmSync } from 'node:fs'

const origen = new URL('../dist', import.meta.url)
const destino = new URL('../../pb/pb_public', import.meta.url)
if (!existsSync(origen)) { console.error('No existe app/dist. Compilá primero con: npm run build'); process.exit(1) }
rmSync(destino, { recursive: true, force: true })
cpSync(origen, destino, { recursive: true })
console.log('Listo: la app quedó en pb/pb_public. Al iniciar PocketBase se ve en http://127.0.0.1:8090/')
