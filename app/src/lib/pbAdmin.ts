import PocketBase, { LocalAuthStore } from 'pocketbase'

export const pbAdmin = new PocketBase(
  import.meta.env.VITE_PB_URL ?? '/',
  new LocalAuthStore('pb_admin_auth'),
)
pbAdmin.autoCancellation(false)
