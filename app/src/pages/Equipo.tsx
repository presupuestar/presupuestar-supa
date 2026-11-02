import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { ClaveDialog } from '../components/ClaveDialog'
import { useSesion } from '../context/Sesion'
import { repositorio } from '../lib/repositorio'
import { generarClave } from '../lib/clave'
import { mensajeError } from '../lib/errores'
import { fechaCorta } from '../lib/formato'
import type { UsuarioEquipo } from '../lib/tipos'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El administrador de la empresa crea y gestiona a sus empleados. */
export function Equipo() {
  const { usuario, empresa } = useSesion()
  const [lista, setLista] = useState<UsuarioEquipo[] | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ texto: string; copiar: string } | null>(null)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState(generarClave())
  const [guardando, setGuardando] = useState(false)
  const [claveDe, setClaveDe] = useState<UsuarioEquipo | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cargar = () => repositorio.usuarios.listar().then(setLista).catch((e) => { setLista([]); setError(mensajeError(e, 'No se pudo cargar el equipo.')) })
  useEffect(() => { cargar() }, [])

  const mensajeAcceso = (n: string, correo: string, c: string) =>
    `Hola${n ? ' ' + n.split(' ')[0] : ''}! Ya podés ingresar a PresupuestAR para armar presupuestos${empresa ? ' de ' + empresa.nombre : ''}.\nEntrá desde ${location.origin}\nCorreo: ${correo}\nContraseña: ${c}`

  const crear = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!nombre.trim()) return setError('Poné el nombre de la persona.')
    if (!EMAIL.test(email.trim())) return setError('Escribí un correo electrónico válido.')
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setError(''); setGuardando(true)
    try {
      await repositorio.usuarios.crear({ name: nombre.trim(), email: email.trim(), password: clave })
      setAviso({ texto: `${nombre.trim()} ya puede ingresar. Copiá los datos de acceso y pasáselos: la contraseña no se vuelve a mostrar.`, copiar: mensajeAcceso(nombre.trim(), email.trim(), clave) })
      setNombre(''); setEmail(''); setClave(generarClave()); setCopiado(false)
      await cargar()
    } catch (e) { setError(mensajeError(e, 'No se pudo crear el empleado.')) }
    finally { setGuardando(false) }
  }

  const eliminar = async (u: UsuarioEquipo) => {
    if (!confirm(`¿Eliminar a ${u.name || u.email}?\n\nYa no va a poder ingresar. Los presupuestos que hizo se mantienen.`)) return
    try { await repositorio.usuarios.eliminar(u.id); await cargar() }
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar al empleado.')) }
  }

  const copiar = async () => {
    if (!aviso) return
    try { await navigator.clipboard.writeText(aviso.copiar); setCopiado(true) } catch { setError('No se pudo copiar. Seleccioná el texto a mano.') }
  }

  if (usuario?.rol !== 'admin') {
    return <Layout><main className="contenido"><h1>Equipo</h1><p className="sub">Solo el administrador de la empresa puede gestionar el equipo.</p></main></Layout>
  }

  return (
    <Layout>
      <main className="contenido ancho">
        <h1>Equipo</h1>
        <p className="sub">Creá usuarios para tus empleados: van a ingresar desde su computadora con su propio correo y contraseña, y ven solo los datos de {empresa?.nombre ?? 'tu empresa'}.</p>

        {error && <p className="error" role="alert">{error}</p>}

        {aviso && (
          <section className="aviso" role="status">
            <p>{aviso.texto}</p>
            <pre>{aviso.copiar}</pre>
            <div className="botones izq">
              <button className="btn chico" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar datos de acceso'}</button>
              <button className="btn sec chico" onClick={() => setAviso(null)}>Cerrar</button>
            </div>
          </section>
        )}

        <section className="panel">
          <h2>Nuevo empleado</h2>
          <form onSubmit={crear} className="tres" noValidate>
            <label className="campo">Nombre y apellido
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" maxLength={120} />
            </label>
            <label className="campo">Correo electrónico
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </label>
            <label className="campo">Contraseña inicial
              <input value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} />
              <button type="button" className="link ayuda-link" onClick={() => setClave(generarClave())}>Generar otra</button>
            </label>
            <div className="botones izq fila-completa"><button className="btn chico" disabled={guardando}>{guardando ? 'Creando…' : 'Crear empleado'}</button></div>
          </form>
        </section>

        <div className="tabla-caja" style={{ marginTop: 20 }}>
          <table className="tabla tabla-equipo">
            <thead><tr><th>Persona</th><th>Correo</th><th>Rol</th><th>Alta</th><th><span className="sr">Acciones</span></th></tr></thead>
            <tbody>
              {lista === null && <tr className="fila-vacia"><td colSpan={5} className="vacio">Cargando…</td></tr>}
              {lista?.map((u) => (
                <tr key={u.id}>
                  <td className="equipo-persona" data-label="Persona"><strong>{u.name || '—'}</strong>{u.id === usuario?.id && <small>Vos</small>}</td>
                  <td className="equipo-correo" data-label="Correo">{u.email}</td>
                  <td className="equipo-rol" data-label="Rol"><span className={`pill ${u.rol === 'admin' ? 'pers' : 'off'}`}>{u.rol === 'admin' ? 'Administrador' : 'Empleado'}</span></td>
                  <td className="equipo-alta" data-label="Alta">{fechaCorta(u.created)}</td>
                  <td className="acciones equipo-acciones">
                    {u.rol === 'miembro' && <>
                      <button className="link" onClick={() => setClaveDe(u)}>Cambiar contraseña</button>
                      <button className="link peligro" onClick={() => eliminar(u)}>Eliminar</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {claveDe && (
        <ClaveDialog
          titulo={`Nueva contraseña para ${claveDe.name || claveDe.email}`}
          alCerrar={() => setClaveDe(null)}
          alGuardar={async (c) => {
            await repositorio.usuarios.restablecerClave(claveDe.id, c)
            setAviso({ texto: `Listo: la contraseña de ${claveDe.name || claveDe.email} cambió. Pasale los datos nuevos.`, copiar: mensajeAcceso(claveDe.name ?? '', claveDe.email, c) })
            setCopiado(false)
          }}
        />
      )}
    </Layout>
  )
}
