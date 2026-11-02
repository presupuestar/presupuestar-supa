import PocketBase from 'pocketbase'

// '/' = mismo origen (en desarrollo Vite reenvía /api a PocketBase).
// Para otro servidor definí VITE_PB_URL en un archivo .env.
export const pb = new PocketBase(import.meta.env.VITE_PB_URL ?? '/')
pb.autoCancellation(false)
