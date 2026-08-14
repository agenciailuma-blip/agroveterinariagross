import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Faltan las variables de entorno de Supabase. Copiá .env.example a .env y completalo.',
  )
}

/*
  ─────────────────────────────────────────────────────────────
  Tiempo límite de las peticiones

  Sin esto, una petición puede quedar colgada indefinidamente. No es
  hipotético: cuando se corta internet pero el sistema operativo todavía
  cree que hay ruta —la placa ve el router, el router no llega a
  ningún lado— el navegador no falla, espera. Y lo mismo pasa con una
  conexión que anda pero va muy lenta.

  El resultado visible es peor que un error: la pantalla se queda
  "Cargando…" o "Enviando…" para siempre y quien está en el mostrador no
  sabe si funcionó, si falló, o si tiene que volver a apretar. Un error
  claro a los doce segundos es infinitamente mejor.

  Doce segundos es holgado para una consulta normal y corto para que
  nadie se quede mirando la pantalla.
  ─────────────────────────────────────────────────────────────
*/
const LIMITE_MS = 12_000

function fetchConLimite(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const control = new AbortController()
  // Se marca con una bandera propia en vez de mirar el nombre del error.
  // Abortar con una razón propia hace que el error llegue con ESE nombre
  // y no como AbortError, así que reconocerlo por el nombre falla en
  // silencio — que es justo lo que no queremos de un manejo de errores.
  let porTiempo = false
  const timer = setTimeout(() => {
    porTiempo = true
    control.abort()
  }, LIMITE_MS)

  // Supabase puede traer su propia señal de cancelación; hay que
  // respetarla además de la nuestra.
  const externa = init?.signal
  if (externa) {
    if (externa.aborted) control.abort(externa.reason)
    else externa.addEventListener('abort', () => control.abort(externa.reason), { once: true })
  }

  return fetch(entrada, { ...init, signal: control.signal })
    .catch((e) => {
      // Se traduce a algo que el resto del código ya reconoce como fallo
      // de red, en vez de una cancelación que parece deliberada.
      if (porTiempo) {
        throw new TypeError('Failed to fetch: el servidor no respondió a tiempo')
      }
      throw e
    })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient(url, key, {
  auth: {
    // La terminal de mostrador queda con la sesión abierta todo el día:
    // el operador se identifica con PIN, no volviendo a loguearse.
    persistSession: true,
    autoRefreshToken: true,
  },
  global: { fetch: fetchConLimite },
})
