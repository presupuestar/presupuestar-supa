import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en app/.env.local.')
}

export const supabase = createClient(url, publishableKey, {
  auth: { detectSessionInUrl: false },
})

export const supabasePropietario = createClient(url, publishableKey, {
  auth: {
    storageKey: 'presupuestar-owner-auth',
    detectSessionInUrl: false,
  },
})
