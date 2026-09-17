import { createClient } from '@supabase/supabase-js'
import { Cortacircuito } from '@/lib/cortacircuito'

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

/*
  Y cuando ya se sabe que el servidor no está, ni siquiera esperar eso.

  Doce segundos por consulta está bien para la primera. Para la quinta
  seguida, con internet cortado, es un minuto de pantalla en blanco: es
  lo que pasó en el local el 17/09 al abrir la Caja. El cortacircuito
  descarta en el acto las que vienen atrás de una que falló, y cada
  quince segundos deja pasar una para ver si volvió.

  El resultado que recibe quien llamó es el MISMO fallo de red de
  siempre, así que cada consulta sigue haciendo lo que ya hacía: leer la
  copia local. Acá no se decide qué se muestra, sólo cuánto se espera.
*/
const cortacircuito = new Cortacircuito()

function fallaDeRed(motivo: string): TypeError {
  return new TypeError(`Failed to fetch: ${motivo}`)
}

function fetchConLimite(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!cortacircuito.dejarPasar()) {
    return Promise.reject(fallaDeRed('el servidor no está respondiendo (se lo dio por caído)'))
  }

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
    .then((r) => {
      // Contestó algo, aunque sea un error del servidor: la red está.
      cortacircuito.anotarExito()
      return r
    })
    .catch((e) => {
      /*
        Sólo cuenta como "el servidor no está" lo que es un fallo de red
        o el límite de tiempo. Una cancelación pedida por quien llamó
        —cambió de pantalla, se desmontó el componente— no dice nada
        sobre la conexión, y tomarla por caída dejaría al sistema
        trabajando local sin motivo.
      */
      if (porTiempo) {
        cortacircuito.anotarFalla()
        throw fallaDeRed('el servidor no respondió a tiempo')
      }
      if (!control.signal.aborted) cortacircuito.anotarFalla()
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
