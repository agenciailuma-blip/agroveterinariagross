import { createClient } from '@supabase/supabase-js'
import { Cortacircuito } from '@/lib/cortacircuito'
import { esFuncionDeArca, LIMITE_ARCA_MS } from '@/lib/funcionesDeArca'

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
  Salvo lo que espera a ARCA —el CAE, el CAEA y la consulta de un CUIT—,
  que es otro servidor y tarda lo suyo: ver lib/funcionesDeArca.ts.
  Cortarlo a los doce dejaba al cajero con un error mientras el CAE
  salía igual, y lo hacía pasar por caída de internet.
*/
function limitePara(entrada: RequestInfo | URL): number {
  return esFuncionDeArca(entrada) ? LIMITE_ARCA_MS : LIMITE_MS
}

/*
  Y cuando ya se sabe que el servidor no está, ni siquiera esperar eso.

  Doce segundos por consulta está bien para la primera. Para la quinta
  seguida, con internet cortado, es un minuto de pantalla en blanco: es
  lo que pasó en el local el 17/09 al abrir la Caja. El cortacircuito
  descarta en el acto las que vienen atrás de una que falló, y una
  prueba de fondo, cada diez segundos, se fija si volvió.

  El resultado que recibe quien llamó es el MISMO fallo de red de
  siempre, así que cada consulta sigue haciendo lo que ya hacía: leer la
  copia local. Acá no se decide qué se muestra, sólo cuánto se espera.
*/
const cortacircuito = new Cortacircuito()

function fallaDeRed(motivo: string): TypeError {
  return new TypeError(`Failed to fetch: ${motivo}`)
}

/*
  La prueba de si el servidor volvió, de fondo.

  Una consulta propia, mínima y con espera corta: cualquier respuesta —aun
  un error— quiere decir que hay servidor. Nadie la está esperando, así
  que tarde lo que tarde no traba ninguna pantalla. Ver lib/cortacircuito.ts
  para por qué no puede ser la consulta de alguien.
*/
const ESPERA_DE_LA_PRUEBA_MS = 6_000
let probando = false

export async function probarServidor(): Promise<boolean> {
  if (probando) return false
  probando = true
  try {
    await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(ESPERA_DE_LA_PRUEBA_MS),
      cache: 'no-store',
    })
    cortacircuito.anotarExito()
    return true
  } catch {
    return false
  } finally {
    probando = false
  }
}

/** Si el servidor está dado por caído ahora: reintentar una consulta no tiene sentido. */
export function servidorCaido(): boolean {
  return cortacircuito.abierto
}

/** Avisa cuando el servidor se da por caído (true) o vuelve (false). */
export function alCambiarElServidor(oyente: (caido: boolean) => void): () => void {
  return cortacircuito.alCambiar(oyente)
}

if (typeof window !== 'undefined') {
  // Se pregunta seguido; el cortacircuito contesta que sí una vez por ventana.
  setInterval(() => {
    if (cortacircuito.tocaProbar()) void probarServidor()
  }, 2_000)

  // Cuando Windows sabe que no hay red —el cable de la PC, el wifi—, no hace
  // falta esperar a que falle una consulta para enterarse.
  window.addEventListener('offline', () => cortacircuito.anotarFalla())
  window.addEventListener('online', () => void probarServidor())
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
  }, limitePara(entrada))

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
  /*
    Sin reintentos de la biblioteca.

    Desde la 2.x, supabase-js reintenta sola tres veces, con pausas, toda
    consulta de lectura que falla por red: unos siete segundos antes de
    devolver el error. Sin internet, el cortacircuito la corta en el acto
    y la biblioteca igual espera y reintenta, así que cada pantalla que
    lee algo tarda siete segundos en pasar a la copia local. Medido el
    19/10: el Mostrador tardaba de siete a nueve segundos en aparecer sin
    servidor, y ninguna consulta salía a la red. Con conexión, lo que
    reintenta es el cortacircuito, de fondo; y cada consulta ya sabe qué
    hacer cuando falla.
  */
  db: { retry: false },
})
