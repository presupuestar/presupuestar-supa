import PocketBase, { LocalAuthStore } from 'pocketbase'

/**
 * Cliente aparte para el propietario (superusuario). Guarda su sesión en otra clave del navegador,
 * así no se mezcla con la sesión de un usuario de empresa.
 */
export const pbAdmin = new PocketBase(import.meta.env.VITE_PB_URL ?? '/', new LocalAuthStore('pb_admin_auth'))
pbAdmin.autoCancellation(false)
