import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { repositorio } from '../lib/repositorio'
import { aplicarTema, restablecerTema } from '../lib/tema'
import type { Empresa, PermisoEmpresa } from '../lib/tipos'

export interface UsuarioSesion {
  id: string
  email: string
  name: string
  empresa: string
  rol: string
  permisos: PermisoEmpresa[]
  primerAccesoClaveRespondido: boolean
}

interface Valor {
  usuario: UsuarioSesion | null
  empresa: Empresa | null
  cargando: boolean
  necesitaClaveActual: boolean
  errorEmpresa: string
  entrar: (email: string, clave: string) => Promise<void>
  resolverPrimerAcceso: (clave?: string, claveActual?: string) => Promise<void>
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
    const cargar = async (user: User | null) => {
      if (!user) {
        if (vigente) {
          setUsuario(null)
          setEmpresa(null)
          setErrorEmpresa('')
          restablecerTema()
          setCargando(false)
        }
        return
      }
      try {
        const perfil = await perfilDeUsuario(user)
        if (vigente) setUsuario(perfil)
      } catch (error) {
        await supabase.auth.signOut()
        if (vigente) setErrorEmpresa(error instanceof Error ? error.message : 'No se pudo cargar el perfil.')
      } finally {
        if (vigente) setCargando(false)
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      return cargar(data.session?.user ?? null)
    }).catch((error: unknown) => {
      if (vigente) {
        setErrorEmpresa(error instanceof Error ? error.message : 'No se pudo validar la sesión.')
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
        if (vigente) setErrorEmpresa(error instanceof Error ? error.message : 'No se pudo cargar la empresa.')
      })
    return () => { vigente = false }
  }, [usuario?.id, usuario?.empresa])

  const entrar = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Supabase no devolvió el usuario autenticado.')
    setUsuario(await perfilDeUsuario(data.user))
  }

  const resolverPrimerAcceso = async (password?: string) => {
    if (!usuario) return
    if (password) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    }
    const { error } = await supabase.from('profiles')
      .update({ first_access_password_answered: true })
      .eq('user_id', usuario.id)
    if (error) throw error
    setUsuario({ ...usuario, primerAccesoClaveRespondido: true })
  }

  const salir = () => { void supabase.auth.signOut() }

  return (
    <Ctx.Provider value={{
      usuario,
      empresa,
      cargando,
      necesitaClaveActual: false,
      errorEmpresa,
      entrar,
      resolverPrimerAcceso,
      salir,
    }}>
      {children}
    </Ctx.Provider>
  )
}
