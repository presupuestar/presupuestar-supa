import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { ClaveDialog } from '../components/ClaveDialog'
import { useSesion } from '../context/Sesion'
import { repositorio } from '../lib/repositorio'
import { generarClave } from '../lib/clave'
import { mensajeError } from '../lib/errores'
import { fechaCorta } from '../lib/formato'
import { PERMISOS_EMPRESA, type PermisoEmpresa, type RolEmpresa, type UsuarioEquipo } from '../lib/tipos'

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
  const [rolNuevoUsuario, setRolNuevoUsuario] = useState('member')
  const [guardando, setGuardando] = useState(false)
  const [roles, setRoles] = useState<RolEmpresa[]>([])
  const [nombreRol, setNombreRol] = useState('')
  const [permisosRol, setPermisosRol] = useState<PermisoEmpresa[]>([])
  const [rolEnEdicion, setRolEnEdicion] = useState<string | null>(null)
  const [rolCargando, setRolCargando] = useState(false)
  const [rolGuardandoUsuario, setRolGuardandoUsuario] = useState<string | null>(null)
  const [claveDe, setClaveDe] = useState<UsuarioEquipo | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cargar = () => repositorio.usuarios.listar().then(setLista).catch((e) => { setLista([]); setError(mensajeError(e, 'No se pudo cargar el equipo.')) })
  const cargarRoles = () => repositorio.roles.listar().then(setRoles).catch((e) => setError(mensajeError(e, 'No se pudieron cargar los roles.')))
  useEffect(() => { cargar() }, [])
  useEffect(() => { cargarRoles() }, [])

  const mensajeAcceso = (n: string, correo: string, c: string) =>
    `Hola${n ? ' ' + n.split(' ')[0] : ''}! Ya podés ingresar a PresupuestAR para armar presupuestos${empresa ? ' de ' + empresa.nombre : ''}.\nEntrá desde ${location.origin}\nCorreo: ${correo}\nContraseña: ${c}`

  const crear = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!nombre.trim()) return setError('Poné el nombre de la persona.')
    if (!EMAIL.test(email.trim())) return setError('Escribí un correo electrónico válido.')
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setError(''); setGuardando(true)
    try {
      await repositorio.usuarios.crear({ name: nombre.trim(), email: email.trim(), password: clave, role: rolNuevoUsuario })
      setAviso({ texto: `${nombre.trim()} ya puede ingresar. Copiá los datos de acceso y pasáselos: la contraseña no se vuelve a mostrar.`, copiar: mensajeAcceso(nombre.trim(), email.trim(), clave) })
      setNombre(''); setEmail(''); setClave(generarClave()); setRolNuevoUsuario('member'); setCopiado(false)
      await cargar()
    } catch (e) { setError(mensajeError(e, 'No se pudo crear el empleado.')) }
    finally { setGuardando(false) }
  }

  const iniciarEdicionRol = (rol?: RolEmpresa) => {
    setRolEnEdicion(rol?.id ?? '')
    setNombreRol(rol?.nombre ?? '')
    setPermisosRol(rol?.permisos ?? [])
  }

  const guardarRol = async (ev: FormEvent) => {
    ev.preventDefault()
    if (nombreRol.trim().length < 2 || nombreRol.trim().length > 40) return setError('El nombre del rol debe tener entre 2 y 40 caracteres.')
    setError(''); setRolCargando(true)
    try {
      if (rolEnEdicion) await repositorio.roles.actualizar(rolEnEdicion, { nombre: nombreRol, permisos: permisosRol })
      else await repositorio.roles.crear({ nombre: nombreRol, permisos: permisosRol })
      setRolEnEdicion(null); setNombreRol(''); setPermisosRol([])
      await cargarRoles()
    } catch (e) { setError(mensajeError(e, 'No se pudo guardar el rol.')) }
    finally { setRolCargando(false) }
  }

  const eliminarRol = async (rol: RolEmpresa) => {
    if (lista?.some((integrante) => integrante.rol === rol.id)) {
      return setError('No se puede eliminar un rol asignado. Cambiá primero el rol de esas personas.')
    }
    if (!confirm(`¿Eliminar el rol «${rol.nombre}»?`)) return
    try { await repositorio.roles.eliminar(rol.id); await cargarRoles() }
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar el rol.')) }
  }

  const cambiarRolUsuario = async (integrante: UsuarioEquipo, role: string) => {
    setError(''); setRolGuardandoUsuario(integrante.id)
    try {
      await repositorio.usuarios.cambiarRol(integrante.id, role)
      await cargar()
    } catch (e) { setError(mensajeError(e, 'No se pudo cambiar el rol.')) }
    finally { setRolGuardandoUsuario(null) }
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
            <label className="campo">Rol
              <select value={rolNuevoUsuario} onChange={(e) => setRolNuevoUsuario(e.target.value)}>
                <option value="member">Empleado</option>
                {roles.map((rol) => <option key={rol.id} value={rol.id}>{rol.nombre}</option>)}
              </select>
            </label>
            <div className="botones izq fila-completa"><button className="btn chico" disabled={guardando}>{guardando ? 'Creando…' : 'Crear empleado'}</button></div>
          </form>
        </section>

        <section className="panel" style={{ marginTop: 20 }}>
          <div className="encabezado">
            <div><h2>Roles personalizados</h2><p className="sub">Elegí qué puede hacer cada rol. El administrador conserva todos los permisos.</p></div>
            <button type="button" className="btn sec chico" onClick={() => iniciarEdicionRol()}>Crear rol</button>
          </div>
          {rolEnEdicion !== null && (
            <form onSubmit={guardarRol} className="formulario-rol">
              <label className="campo">Nombre del rol
                <input value={nombreRol} onChange={(e) => setNombreRol(e.target.value)} maxLength={40} autoFocus />
              </label>
              <fieldset className="permisos-rol">
                <legend>Permisos</legend>
                {PERMISOS_EMPRESA.map((permiso) => (
                  <label key={permiso.codigo}>
                    <input type="checkbox" checked={permisosRol.includes(permiso.codigo)}
                      onChange={(e) => setPermisosRol((actuales) => e.target.checked
                        ? [...actuales, permiso.codigo]
                        : actuales.filter((p) => p !== permiso.codigo))} />
                    {permiso.nombre}
                  </label>
                ))}
              </fieldset>
              <div className="botones izq">
                <button className="btn chico" disabled={rolCargando}>{rolCargando ? 'Guardando…' : 'Guardar rol'}</button>
                <button type="button" className="btn sec chico" onClick={() => setRolEnEdicion(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {roles.length > 0 ? <ul className="lista-roles">{roles.map((rol) => (
            <li key={rol.id}>
              <span><strong>{rol.nombre}</strong><small>{rol.permisos.map((permiso) => PERMISOS_EMPRESA.find((p) => p.codigo === permiso)?.nombre).filter(Boolean).join(' · ') || 'Sin permisos asignados'}</small></span>
              <span className="acciones">
                <button className="link" onClick={() => iniciarEdicionRol(rol)}>Editar</button>
                <button className="link peligro" onClick={() => void eliminarRol(rol)}>Eliminar</button>
              </span>
            </li>
          ))}</ul> : <p className="ayuda">Todavía no creaste roles personalizados.</p>}
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
                  <td className="equipo-rol" data-label="Rol">
                    {u.rol === 'admin' ? <span className="pill pers">Administrador</span> : (
                      <select value={u.rol} disabled={rolGuardandoUsuario === u.id} aria-label={`Rol de ${u.name || u.email}`}
                        onChange={(e) => void cambiarRolUsuario(u, e.target.value)}>
                        <option value="member">Empleado</option>
                        {roles.map((rol) => <option key={rol.id} value={rol.id}>{rol.nombre}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="equipo-alta" data-label="Alta">{fechaCorta(u.created)}</td>
                  <td className="acciones equipo-acciones">
                    {u.rol !== 'admin' && <>
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
