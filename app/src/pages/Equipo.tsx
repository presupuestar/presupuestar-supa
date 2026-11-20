import { Iniciales } from '../components/Iniciales'
import { CargandoFilas } from '../components/EstadoVacio'
import { useAvisos } from '../components/Avisos'
import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { ClaveDialog } from '../components/ClaveDialog'
import { useSesion } from '../context/Sesion'
import { repositorio } from '../lib/repositorio'
import { generarClave } from '../lib/clave'
import { advertenciaAcceso, mensajeBienvenida, mensajeClaveNueva } from '../lib/bienvenida'
import { mensajeError } from '../lib/errores'
import { fechaCorta } from '../lib/formato'
import { PERMISOS_EMPRESA, type PermisoEmpresa, type RolEmpresa, type UsuarioEquipo } from '../lib/tipos'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Ver los presupuestos de todo el equipo queda reservado al administrador. */
const PERMISOS_ROL = PERMISOS_EMPRESA.filter((permiso) => permiso.codigo !== 'quotes.view_all')

function mensajeErrorRoles(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') {
    return 'No está instalada la tabla de roles personalizados en Supabase. Desde la raíz del proyecto ejecutá `npx supabase db push --project-ref eqsxzfhpsfaxazzqvnyo` para aplicar la migración pendiente. No vuelvas a ejecutar las migraciones iniciales.'
  }
  return mensajeError(error, 'No se pudieron cargar los roles.')
}

/** El administrador de la empresa crea y gestiona a sus empleados. */
export function Equipo() {
  const { usuario, empresa } = useSesion()
  const { confirmar, avisar, mostrarDatos } = useAvisos()
  const [lista, setLista] = useState<UsuarioEquipo[] | null>(null)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState(generarClave())
  const [verClave, setVerClave] = useState(false)
  const [rolNuevoUsuario, setRolNuevoUsuario] = useState('member')
  // Las ganancias son información sensible: por defecto, un empleado nuevo no las ve.
  const [verGananciasNuevo, setVerGananciasNuevo] = useState(false)
  const [gananciasGuardando, setGananciasGuardando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [roles, setRoles] = useState<RolEmpresa[]>([])
  const [nombreRol, setNombreRol] = useState('')
  const [permisosRol, setPermisosRol] = useState<PermisoEmpresa[]>([])
  const [rolEnEdicion, setRolEnEdicion] = useState<string | null>(null)
  const [rolCargando, setRolCargando] = useState(false)
  const [rolGuardandoUsuario, setRolGuardandoUsuario] = useState<string | null>(null)
  const [claveDe, setClaveDe] = useState<UsuarioEquipo | null>(null)

  const cargar = () => repositorio.usuarios.listar().then(setLista).catch((e) => { setLista([]); setError(mensajeError(e, 'No se pudo cargar el equipo.')) })
  const cargarRoles = () => repositorio.roles.listar().then(setRoles).catch((e) => setError(mensajeErrorRoles(e)))
  useEffect(() => { cargar() }, [])
  useEffect(() => { cargarRoles() }, [])


  const crear = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!nombre.trim()) return setError('Poné el nombre de la persona.')
    if (!EMAIL.test(email.trim())) return setError('Escribí un correo electrónico válido.')
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setError(''); setGuardando(true)
    try {
      await repositorio.usuarios.crear({ name: nombre.trim(), email: email.trim(), password: clave, role: rolNuevoUsuario, verGanancias: verGananciasNuevo })
      void mostrarDatos({
        titulo: `${nombre.trim()} ya puede entrar`,
        mensaje: 'Copiá este mensaje de bienvenida y mandáselo por WhatsApp o correo.',
        datos: mensajeBienvenida({ nombre: nombre.trim(), empresa: empresa?.nombre, email: email.trim(), clave, rol: rolNuevoUsuario }),
        advertencia: advertenciaAcceso(),
      })
      setNombre(''); setEmail(''); setClave(generarClave()); setVerClave(false); setRolNuevoUsuario('member'); setVerGananciasNuevo(false)
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
      avisar('Rol guardado.')
      await cargarRoles()
    } catch (e) { setError(mensajeError(e, 'No se pudo guardar el rol.')) }
    finally { setRolCargando(false) }
  }

  const eliminarRol = async (rol: RolEmpresa) => {
    if (lista?.some((integrante) => integrante.rol === rol.id)) {
      return setError('No se puede eliminar un rol asignado. Cambiá primero el rol de esas personas.')
    }
    if (!await confirmar({ titulo: `¿Eliminar el rol «${rol.nombre}»?`, confirmar: 'Eliminar rol', peligro: true })) return
    try { await repositorio.roles.eliminar(rol.id); avisar('Rol eliminado.'); await cargarRoles() }
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar el rol.')) }
  }

  const cambiarRolUsuario = async (integrante: UsuarioEquipo, role: string) => {
    setError(''); setRolGuardandoUsuario(integrante.id)
    try {
      await repositorio.usuarios.cambiarRol(integrante.id, role)
      avisar('Rol actualizado.')
      await cargar()
    } catch (e) { setError(mensajeError(e, 'No se pudo cambiar el rol.')) }
    finally { setRolGuardandoUsuario(null) }
  }

  const cambiarGanancias = async (integrante: UsuarioEquipo, puede: boolean) => {
    setError(''); setGananciasGuardando(integrante.id)
    try {
      await repositorio.usuarios.cambiarVerGanancias(integrante.id, puede)
      avisar(puede ? `${integrante.name || integrante.email} ahora ve las ganancias.` : `${integrante.name || integrante.email} ya no ve las ganancias.`)
      await cargar()
    } catch (e) { setError(mensajeError(e, 'No se pudo cambiar el permiso de ganancias.')) }
    finally { setGananciasGuardando(null) }
  }

  const eliminar = async (u: UsuarioEquipo) => {
    if (!await confirmar({ titulo: `¿Eliminar a ${u.name || u.email}?`, mensaje: 'Ya no va a poder ingresar. Los presupuestos que hizo se mantienen.', confirmar: 'Eliminar', peligro: true })) return
    try { await repositorio.usuarios.eliminar(u.id); avisar(`${u.name || u.email} ya no forma parte del equipo.`); await cargar() }
    catch (e) { setError(mensajeError(e, 'No se pudo eliminar al empleado.')) }
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
              <span className="campo-password-primer">
                <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" spellCheck={false} />
                <button type="button" className="ojo-password" aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVerClave(!verClave)}><span aria-hidden="true" /></button>
              </span>
              <button type="button" className="link ayuda-link" onClick={() => setClave(generarClave())}>Generar otra</button>
            </label>
            <label className="campo">Rol
              <select value={rolNuevoUsuario} onChange={(e) => setRolNuevoUsuario(e.target.value)}>
                <option value="member">Empleado</option>
                {roles.map((rol) => <option key={rol.id} value={rol.id}>{rol.nombre}</option>)}
              </select>
            </label>
            <label className="check fila-completa ganancias-check">
              <input type="checkbox" checked={verGananciasNuevo} onChange={(e) => setVerGananciasNuevo(e.target.checked)} />
              <span>Puede ver las ganancias<small>Ve la ganancia estimada de los presupuestos y en el resumen. Se puede cambiar después.</small></span>
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
                {PERMISOS_ROL.map((permiso) => {
                  // Quien crea presupuestos siempre ve los suyos: se marca solo y no se puede quitar.
                  const implicito = permiso.codigo === 'quotes.view_own' && permisosRol.includes('quotes.create')
                  return (
                    <label key={permiso.codigo}>
                      <input type="checkbox" checked={implicito || permisosRol.includes(permiso.codigo)} disabled={implicito}
                        onChange={(e) => setPermisosRol((actuales) => e.target.checked
                          ? [...actuales, permiso.codigo]
                          : actuales.filter((p) => p !== permiso.codigo))} />
                      <span>{permiso.nombre}{implicito && <small className="permiso-implicito"> · incluido al crear presupuestos</small>}</span>
                    </label>
                  )
                })}
              </fieldset>
              <div className="botones izq">
                <button className="btn chico" disabled={rolCargando}>{rolCargando ? 'Guardando…' : 'Guardar rol'}</button>
                <button type="button" className="btn sec chico" onClick={() => setRolEnEdicion(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {roles.length > 0 ? <ul className="lista-roles">{roles.map((rol) => (
            <li key={rol.id}>
              <div className="rol-detalle">
                <strong>{rol.nombre}</strong>
                {rol.permisos.some((permiso) => PERMISOS_ROL.some((p) => p.codigo === permiso))
                  ? <ul className="chips-permisos" aria-label={`Permisos de ${rol.nombre}`}>
                      {PERMISOS_ROL.filter((p) => rol.permisos.includes(p.codigo) ||
                        (p.codigo === 'quotes.view_own' && rol.permisos.includes('quotes.create')))
                        .map((p) => <li key={p.codigo}>{p.nombre}</li>)}
                    </ul>
                  : <small>Sin permisos asignados</small>}
              </div>
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
              {lista === null && <CargandoFilas columnas={5} filas={3} />}
              {lista?.map((u) => (
                <tr key={u.id}>
                  <td className="equipo-persona" data-label="Persona"><span className="persona"><Iniciales nombre={u.name || u.email} clave={u.email} /><span><strong>{u.name || '—'}</strong>{u.id === usuario?.id && <small>Vos</small>}</span></span></td>
                  <td className="equipo-correo" data-label="Correo">{u.email}</td>
                  <td className="equipo-rol" data-label="Rol">
                    {u.rol === 'admin' ? <span className="pill pers">Administrador</span> : (
                      <select value={u.rol} disabled={rolGuardandoUsuario === u.id} aria-label={`Rol de ${u.name || u.email}`}
                        onChange={(e) => void cambiarRolUsuario(u, e.target.value)}>
                        <option value="member">Empleado</option>
                        {roles.map((rol) => <option key={rol.id} value={rol.id}>{rol.nombre}</option>)}
                      </select>
                    )}
                    {u.rol !== 'admin' && (
                      <label className="check ganancias-fila">
                        <input type="checkbox" checked={Boolean(u.verGanancias)} disabled={gananciasGuardando === u.id}
                          onChange={(e) => void cambiarGanancias(u, e.target.checked)} />
                        Ve ganancias
                      </label>
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
            void mostrarDatos({
              titulo: `Contraseña de ${claveDe.name || claveDe.email} cambiada`,
              mensaje: 'Copiá este mensaje y mandáselo.',
              datos: mensajeClaveNueva({ nombre: claveDe.name, email: claveDe.email, clave: c }),
              advertencia: advertenciaAcceso(),
            })
          }}
        />
      )}
    </Layout>
  )
}
