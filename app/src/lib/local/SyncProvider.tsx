import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { db } from '@/lib/local/db'
import { hayDatosLocales } from '@/lib/local/consultas'
import { pendientes, recuperarHuerfanas, sincronizar } from '@/lib/local/sync'
import { useConexion } from '@/lib/useConexion'
import { useTerminal } from '@/lib/terminal'
import { supabase } from '@/lib/supabase'

interface EstadoSync {
  /** Hay copia local utilizable: la terminal puede trabajar sin conexión. */
  listo: boolean
  sincronizando: boolean
  ultimaSync: Date | null
  sinSubir: number
  error: string | null
  enLinea: boolean
  sincronizar: () => Promise<void>
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

  useEffect(() => {
    if (!enLinea) return
    correr()
    const timer = setInterval(correr, INTERVALO_MS)
    return () => clearInterval(timer)
  }, [enLinea, correr])

  // Al volver la conexión se sincroniza enseguida: lo que se vendió sin
  // internet no puede quedar esperando al próximo ciclo.
  useEffect(() => {
    function alVolver() {
      void correr()
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [correr])

  const valor = useMemo(
    () => ({ listo, sincronizando, ultimaSync, sinSubir, error, enLinea, sincronizar: correr }),
    [listo, sincronizando, ultimaSync, sinSubir, error, enLinea, correr],
  )

  return <Contexto value={valor}>{children}</Contexto>
}

export function useSync() {
  const ctx = use(Contexto)
  if (!ctx) throw new Error('useSync debe usarse dentro de SyncProvider')
  return ctx
}
