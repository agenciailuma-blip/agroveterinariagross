import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Faltan las variables de entorno de Supabase. Copiá .env.example a .env y completalo.',
  )
}

export const supabase = createClient(url, key, {
  auth: {
    // La terminal de mostrador queda con la sesión abierta todo el día:
    // el operador se identifica con PIN, no volviendo a loguearse.
    persistSession: true,
    autoRefreshToken: true,
  },
})
