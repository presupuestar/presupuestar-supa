import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabasePropietario } from '../lib/supabase'
import { definirAlcancePresupuestos, repositorio } from '../lib/repositorio'
import { aplicarTema, restablecerTema } from '../lib/tema'
import { mensajeError } from '../lib/errores'
import type { Empresa, PermisoEmpresa } from '../lib/tipos'

export interface UsuarioSesion {
  id: string
  email: string
  name: string
  empresa: string
  rol: string
  permisos: PermisoEmpresa[]
  primerAccesoClaveRespondido: boolean
  terminosAceptados: boolean
  /** Puede ver las ganancias estimadas (el administrador siempre). */
  verGanancias: boolean
}

interface Valor {
  usuario: UsuarioSesion | null
  empresa: Empresa | null
  cargando: boolean
  necesitaClaveActual: boolean
  errorEmpresa: string
  entrar: (email: string, clave: string) => Promise<void>
  resolverPrimerAcceso: (clave?: string, claveActual?: string) => Promise<void>
  aceptarTerminos: () => Promise<void>
  salir: () => void
}

const Ctx = createContext<Valor | null>(null)
export const useSesion = () => {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSesion debe usarse dentro de <SesionProvider>')
  return value
}

const perfilDeUsuario = async (user: User) => repositorio.perfil(user)

export const tienePermiso = (usuario: UsuarioSesion | null, permiso: PermisoEmpresa) =>
  usuario?.rol === 'admin' || Boolean(usuario?.permisos.includes(permiso))

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorEmpresa, setErrorEmpresa] = useState('')

  useEffect(() => {
    let vigente = true
    // Cada cambio de sesión (ingreso, cambio de contraseña, salida) dispara una carga.
    // Solo vale la última: si una carga anterior termina después, se descarta. Así una
    // sesión ya cerrada no vuelve a aparecer como iniciada sin credenciales válidas.
    let ultimaCarga = 0
    const cargar = async (user: User | null) => {
      const turno = ++ultimaCarga
      const esActual = () => vigente && turno === ultimaCarga
      if (!user) {
        definirAlcancePresupuestos(null)
        if (esActual()) {
          setUsuario(null)
          setEmpresa(null)
          restablecerTema()
          setCargando(false)
        }
        return
      }
      try {
        const perfil = await perfilDeUsuario(user)
        if (!esActual()) return
        // La sesión pudo cerrarse mientras se cargaba el perfil.
        const { data: actual } = await supabase.auth.getSession()
        if (!esActual()) return
        if (actual.session?.user.id !== user.id) return
        if (perfil.rol === 'propietario') {
          const [{ data: sesionEmpresa }, { data: sesionPropietario }] = await Promise.all([
            supabase.auth.getSession(),
            supabasePropietario.auth.getSession(),
          ])
          if (sesionEmpresa.session?.user.id === user.id) {
            if (!sesionPropietario.session) {
              const { error: transferenciaError } = await supabasePropietario.auth.setSession({
                access_token: sesionEmpresa.session.access_token,
                refresh_token: sesionEmpresa.session.refresh_token,
              })
              if (transferenciaError) throw transferenciaError
            }
            await supabase.auth.signOut({ scope: 'local' })
          }
          if (vigente) {
            setUsuario(null)
            setEmpresa(null)
            restablecerTema()
            setCargando(false)
          }
          return
        }
        if (esActual()) {
          definirAlcancePresupuestos({ usuario: perfil.id, verTodo: perfil.rol === 'admin' })
          setUsuario(perfil)
          setErrorEmpresa('')
        }
      } catch (error) {
        // Una carga vieja que falla no puede cerrar una sesión más nueva.
        if (!esActual()) return
        await supabase.auth.signOut({ scope: 'local' })
        if (vigente) setErrorEmpresa(mensajeError(error, 'No se pudo cargar el perfil.'))
      } finally {
        if (esActual()) setCargando(false)
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      return cargar(data.session?.user ?? null)
    }).catch((error: unknown) => {
      if (vigente) {
        setErrorEmpresa(mensajeError(error, 'No se pudo validar la sesión.'))
        setCargando(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void cargar(session?.user ?? null) })
    })
    return () => {
      vigente = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!usuario?.empresa) {
      setEmpresa(null)
      setErrorEmpresa('')
      restablecerTema()
      return
    }
    let vigente = true
    repositorio.empresa.obtener()
      .then((value) => {
        if (vigente) {
          setEmpresa(value)
          setErrorEmpresa('')
          aplicarTema(value)
        }
      })
      .catch((error: unknown) => {
        if (vigente) setErrorEmpresa(mensajeError(error, 'No se pudo cargar la empresa.'))
      })
    return () => { vigente = false }
  }, [usuario?.id, usuario?.empresa])

  const entrar = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Supabase no devolvió el usuario autenticado.')
    try {
      const perfil = await perfilDeUsuario(data.user)
      definirAlcancePresupuestos({ usuario: perfil.id, verTodo: perfil.rol === 'admin' })
      setUsuario(perfil)
      setErrorEmpresa('')
    } catch (perfilError) {
      await supabase.auth.signOut({ scope: 'local' })
      throw perfilError
    }
  }

  const resolverPrimerAcceso = async (password?: string) => {
    if (!usuario) return
    if (password) {
      const { error } = await supabase.auth.updateUser({ password })
      // Repetir la contraseña actual (por ejemplo, la generada) no es un error para el usuario.
      if (error && error.code !== 'same_password') throw error
    }
    const { error } = await supabase.from('profiles')
      .update({ first_access_password_answered: true })
      .eq('user_id', usuario.id)
    if (error) throw error
    setUsuario({ ...usuario, primerAccesoClaveRespondido: true })
  }

  const aceptarTerminos = async () => {
    if (!usuario) return
    await repositorio.aceptarTerminos(usuario.id)
    setUsuario({ ...usuario, terminosAceptados: true })
  }

  const salir = () => { void supabase.auth.signOut({ scope: 'local' }) }

  return (
    <Ctx.Provider value={{
      usuario,
      empresa,
      cargando,
      necesitaClaveActual: false,
      errorEmpresa,
      entrar,
      resolverPrimerAcceso,
      aceptarTerminos,
      salir,
    }}>
      {children}
    </Ctx.Provider>
  )
}
