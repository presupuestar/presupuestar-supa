import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RecordModel } from 'pocketbase'
import { pb } from '../lib/pb'
import { repositorio } from '../lib/repositorio'
import { aplicarTema, restablecerTema } from '../lib/tema'
import type { Empresa } from '../lib/tipos'

interface Valor {
  usuario: RecordModel | null
  empresa: Empresa | null
  cargando: boolean
  necesitaClaveActual: boolean
  entrar: (email: string, clave: string) => Promise<void>
  resolverPrimerAcceso: (clave?: string, claveActual?: string) => Promise<void>
  salir: () => void
}

const Ctx = createContext<Valor | null>(null)
export const useSesion = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSesion debe usarse dentro de <SesionProvider>')
  return v
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<RecordModel | null>(pb.authStore.record)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [cargando, setCargando] = useState(true)
  const [claveActual, setClaveActual] = useState('')

  useEffect(() => pb.authStore.onChange((_t, rec) => setUsuario(rec)), [])

  useEffect(() => {
    // Una sesión guardada en el navegador puede ser inválida (base reiniciada, usuario borrado, token vencido):
    // se valida contra el servidor y, si no sirve, se descarta para volver al login.
    const sesion = pb.authStore.isValid
      ? pb.collection('users').authRefresh().then(() => undefined).catch(() => pb.authStore.clear())
      : Promise.resolve(pb.authStore.clear())
    sesion.finally(() => setCargando(false))
  }, [])

  // Cada empresa tiene su marca (logo, colores y tipografías): se carga con el usuario que ingresó.
  const empresaDelUsuario = (usuario?.empresa as string | undefined) ?? ''
  useEffect(() => {
    if (!empresaDelUsuario) { setEmpresa(null); restablecerTema(); return }
    let vigente = true
    repositorio.empresa.obtener()
      .then((e) => { if (vigente) { setEmpresa(e); aplicarTema(e) } })
      .catch(() => {})
    return () => { vigente = false }
  }, [usuario?.id, empresaDelUsuario])

  const entrar = async (email: string, clave: string) => {
    const autenticacion = await pb.collection('users').authWithPassword(email, clave)
    setClaveActual(autenticacion.record.primerAccesoClaveRespondido === true ? '' : clave)
  }
  const resolverPrimerAcceso = async (clave?: string, claveActualIngresada?: string) => {
    if (!usuario) return
    const actual = claveActual || claveActualIngresada
    if (clave && !actual) throw new Error('Ingresá tu contraseña actual para poder cambiarla.')
    const actualizado = await pb.collection('users').update(usuario.id, {
      primerAccesoClaveRespondido: true,
      ...(clave ? { oldPassword: actual, password: clave, passwordConfirm: clave } : {}),
    })
    setUsuario(actualizado)
    setClaveActual('')
  }
  const salir = () => { setClaveActual(''); pb.authStore.clear() }

  return <Ctx.Provider value={{ usuario, empresa, cargando, necesitaClaveActual: !claveActual, entrar, resolverPrimerAcceso, salir }}>{children}</Ctx.Provider>
}
