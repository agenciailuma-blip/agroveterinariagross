import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { liveQuery } from 'dexie'
import { db } from '@/lib/local/db'
import { hayDatosLocales } from '@/lib/local/consultas'
import { pendientes, recuperarHuerfanas, sincronizar } from '@/lib/local/sync'
import { entregarALaCaja, guardarLoQueLlego, ponerseAEscuchar } from '@/lib/local/red'
import type { MensajeDelLocal } from '@/lib/local/red'
import { alLlegarDeLaRed, cerrarPuntoDeEncuentro, enEscritorio } from '@/lib/escritorio'
import { useConexion } from '@/lib/useConexion'
import { useTerminal } from '@/lib/terminal'
import { supabase } from '@/lib/supabase'
import {
  BaseLocalBloqueada,
  cifrarLoQueQuedoEnClaro,
  obtenerLlave,
  rehacerBaseLocal,
} from '@/lib/local/cifrado'

interface EstadoSync {
  /** Hay copia local utilizable: la terminal puede trabajar sin conexión. */
  listo: boolean
  sincronizando: boolean
  ultimaSync: Date | null
  sinSubir: number
  error: string | null
  enLinea: boolean
  /** Esta terminal es la que escucha a las demás, y está escuchando. */
  escuchando: boolean
  sincronizar: () => Promise<void>
  /** La llave de la base local no aparece: sin ella no se puede leer ni vender. */
  bloqueada: BaseLocalBloqueada | null
  /** Rehace la base de esta PC desde el servidor. Se niega si hay operaciones sin subir. */
  rehacer: () => Promise<void>
}

const Contexto = createContext<EstadoSync | null>(null)

const INTERVALO_MS = 60_000

export function SyncProvider({ children }: { children: ReactNode }) {
  const { estado: conexion } = useConexion()
  const { terminal } = useTerminal()

  const [listo, setListo] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null)
  const [sinSubir, setSinSubir] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [escuchando, setEscuchando] = useState(false)
  const [bloqueada, setBloqueada] = useState<BaseLocalBloqueada | null>(null)
  const corriendo = useRef(false)

  const enLinea = conexion === 'en_linea'

  const refrescarPendientes = useCallback(async () => {
    setSinSubir(await pendientes())
  }, [])

  const correr = useCallback(async () => {
    // Una sola sincronización a la vez. Dos en paralelo se pisan los
    // cursores y una de las dos pierde cambios.
    if (corriendo.current || !enLinea) return
    corriendo.current = true
    setSincronizando(true)
    try {
      const r = await sincronizar(terminal?.prefijo)
      setUltimaSync(new Date())
      setError(null)
      setListo(await hayDatosLocales())

      if (terminal) {
        // Deja constancia en el servidor, que es de donde sale la
        // frescura del stock que después consume la tienda online.
        await supabase.rpc('registrar_sincronizacion', {
          p_terminal_id: terminal.id,
          p_direccion: 'completa',
          p_registros_enviados: r.enviadas,
          p_registros_recibidos: r.bajados,
          p_duracion_ms: r.duracion,
          p_resultado: r.fallidas ? 'parcial' : 'ok',
        })
      }
    } catch (e) {
      if (e instanceof BaseLocalBloqueada) setBloqueada(e)
      setError(e instanceof Error ? e.message : 'No se pudo sincronizar.')
    } finally {
      await refrescarPendientes()
      setSincronizando(false)
      corriendo.current = false
    }
  }, [enLinea, terminal, refrescarPendientes])

  /*
    La base local se abre al arrancar, no la primera vez que alguien
    busca un producto. Si IndexedDB estuviera bloqueado —modo privado,
    permisos, disco lleno— hay que enterarse ahora y decirlo, no cuando
    el vendedor tenga a alguien esperando en el mostrador.
  */
  useEffect(() => {
    let vigente = true
    db.open()
      .then(async () => {
        if (!vigente) return
        // Lo que quedó a medio enviar en la sesión anterior vuelve a la
        // cola. Reenviar es seguro; perder una venta no.
        await recuperarHuerfanas()

        /*
          La llave, al arrancar y no cuando alguien busca un cliente.

          Si no aparece, conviene saberlo antes de que haya un cliente
          esperando en el mostrador, con un aviso que diga qué hacer.
        */
        try {
          await obtenerLlave()
          setBloqueada(null)
          // Lo que las versiones anteriores dejaron en claro se cifra de
          // fondo. Si falla, se reintenta la próxima vez que se abra.
          void cifrarLoQueQuedoEnClaro().catch((e) =>
            console.error('[base local] no se pudo terminar de cifrar', e),
          )
        } catch (e) {
          if (e instanceof BaseLocalBloqueada) setBloqueada(e)
          else throw e
        }

        setListo(await hayDatosLocales())
        await refrescarPendientes()
      })
      .catch((e) => {
        if (!vigente) return
        setError(
          `Esta computadora no puede guardar datos localmente (${
            e instanceof Error ? e.message : e
          }). Sin eso no va a poder trabajar sin conexión.`,
        )
      })
    return () => {
      vigente = false
    }
  }, [refrescarPendientes])

  /*
    El contador de pendientes se sigue solo desde la base local.

    Antes se refrescaba dentro de la sincronización, que no corre cuando
    no hay conexión — es decir, dejaba de actualizarse exactamente
    cuando más importa. El vendedor guardaba una venta sin internet y el
    indicador seguía diciendo que no había nada esperando.
  */
  useEffect(() => {
    const sub = liveQuery(() => pendientes()).subscribe({
      next: setSinSubir,
      error: () => {},
    })
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    if (!enLinea) return
    correr()
    const timer = setInterval(correr, INTERVALO_MS)
    return () => clearInterval(timer)
  }, [enLinea, correr])

  /*
    ─────────────────────────────────────────────────────────────
    La red del local

    Todo lo de acá abajo corre JUSTAMENTE cuando lo de arriba no puede:
    sin internet. Es lo que hace que la venta que arma un vendedor
    llegue igual a la caja, que es lo único que faltaba para que "el
    mostrador funciona sin conexión" se cumpla entero.
    ─────────────────────────────────────────────────────────────
  */

  // La terminal de la caja se pone a escuchar y queda escuchando: no
  // depende de que haya o no internet, porque el día que se corte no
  // hay quien la prenda.
  useEffect(() => {
    if (!enEscritorio || !terminal?.es_punto_de_encuentro) return

    let vigente = true
    ponerseAEscuchar()
      .then(() => {
        if (vigente) setEscuchando(true)
      })
      .catch((e) => {
        // No se pisa el error de sincronización: son dos cosas
        // distintas y el de arriba es más urgente.
        console.error('No se pudo abrir el punto de encuentro:', e)
        if (vigente) setEscuchando(false)
      })

    return () => {
      vigente = false
      void cerrarPuntoDeEncuentro()
      setEscuchando(false)
    }
  }, [terminal])

  // Y atiende lo que le mandan las demás.
  useEffect(() => {
    if (!enEscritorio || !terminal?.es_punto_de_encuentro) return

    let soltar: (() => void) | null = null
    let vigente = true

    alLlegarDeLaRed((mensaje) => {
      void guardarLoQueLlego(mensaje as MensajeDelLocal)
    }).then((f) => {
      if (vigente) soltar = f
      else f()
    })

    return () => {
      vigente = false
      soltar?.()
    }
  }, [terminal])

  /*
    Los mostradores le entregan a la caja lo que todavía no pudieron
    subir. Se intenta siempre, con o sin internet: con conexión no hay
    nada pendiente y no cuesta nada, y sin conexión es el único camino.

    Un fallo acá no se muestra en pantalla. Que la caja esté apagada es
    normal —de noche, por ejemplo— y no es algo que el vendedor tenga
    que resolver: la venta ya está guardada y va a subir igual cuando
    vuelva internet.
  */
  useEffect(() => {
    if (!enEscritorio || !terminal || terminal.es_punto_de_encuentro) return

    const entregar = () => {
      entregarALaCaja(terminal).catch(() => {})
    }

    entregar()
    const timer = setInterval(entregar, INTERVALO_MS)
    return () => clearInterval(timer)
  }, [terminal])

  // Al volver la conexión se sincroniza enseguida: lo que se vendió sin
  // internet no puede quedar esperando al próximo ciclo.
  useEffect(() => {
    function alVolver() {
      void correr()
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [correr])

  const rehacer = useCallback(async () => {
    await rehacerBaseLocal()
    await obtenerLlave()
    setBloqueada(null)
    setListo(false)
    await correr()
  }, [correr])

  const valor = useMemo(
    () => ({
      listo,
      sincronizando,
      ultimaSync,
      sinSubir,
      error,
      enLinea,
      escuchando,
      sincronizar: correr,
      bloqueada,
      rehacer,
    }),
    [listo, sincronizando, ultimaSync, sinSubir, error, enLinea, escuchando, correr, bloqueada, rehacer],
  )

  return <Contexto value={valor}>{children}</Contexto>
}

export function useSync() {
  const ctx = use(Contexto)
  if (!ctx) throw new Error('useSync debe usarse dentro de SyncProvider')
  return ctx
}
