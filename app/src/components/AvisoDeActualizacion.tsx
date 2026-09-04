import { useEffect, useState } from 'react'
import { enEscritorio } from '@/lib/escritorio'

/*
  El aviso de que hay una versión nueva del programa.

  Sin esto, corregir algo después del corte significaría ir máquina por
  máquina con un pendrive. Con esto, se publica una vez y las cuatro
  terminales se enteran solas.

  Tres decisiones que valen más que el código:

  1. Es una franja, no un cartel que tape la pantalla. Una actualización
     nunca puede interrumpir una venta con el cliente adelante.
  2. Si falla la consulta, no se dice nada. Que no haya internet, o que
     el servidor de actualizaciones no conteste, no es un problema del
     cajero y no tiene por qué enterarse.
  3. Actualiza sólo cuando la persona lo decide. El programa se cierra
     y vuelve a abrir para terminar, y eso no puede pasar solo en el
     medio de un cobro.
*/

type Estado =
  | { paso: 'sin_novedad' }
  | { paso: 'disponible'; version: string; instalar: () => Promise<void> }
  | { paso: 'bajando'; porcentaje: number | null }
  | { paso: 'listo' }
  | { paso: 'falló'; motivo: string }

export default function AvisoDeActualizacion() {
  const [estado, setEstado] = useState<Estado>({ paso: 'sin_novedad' })
  const [postergado, setPostergado] = useState(false)

  useEffect(() => {
    // En el navegador no hay nada que actualizar: la página siempre
    // sirve la última versión.
    if (!enEscritorio) return

    let vigente = true

    async function mirar() {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const novedad = await check()
        if (!vigente || !novedad) return

        setEstado({
          paso: 'disponible',
          version: novedad.version,
          instalar: async () => {
            setEstado({ paso: 'bajando', porcentaje: null })
            try {
              let total = 0
              let bajado = 0
              await novedad.downloadAndInstall((evento) => {
                if (evento.event === 'Started') {
                  total = evento.data.contentLength ?? 0
                } else if (evento.event === 'Progress') {
                  bajado += evento.data.chunkLength
                  setEstado({
                    paso: 'bajando',
                    porcentaje: total ? Math.round((bajado / total) * 100) : null,
                  })
                }
              })
              setEstado({ paso: 'listo' })

              const { relaunch } = await import('@tauri-apps/plugin-process')
              await relaunch()
            } catch (e) {
              setEstado({
                paso: 'falló',
                motivo: e instanceof Error ? e.message : 'No se pudo actualizar.',
              })
            }
          },
        })
      } catch (e) {
        /*
          No se le dice nada a quien está atendiendo: que no haya
          internet, o que el servidor de actualizaciones no conteste, no
          es asunto suyo.

          Pero sí queda en la consola. Acá adentro caen dos cosas muy
          distintas: un corte de internet, que es normal y pasa solo, y
          una firma que no valida, que es un error de configuración
          nuestro y dejaría el actualizador roto para siempre sin que
          nadie se entere. Sin este mensaje, las dos se ven igual: nada.
        */
        console.warn('[actualizador] no se pudo consultar si hay versión nueva:', e)
      }
    }

    mirar()
    return () => {
      vigente = false
    }
  }, [])

  if (estado.paso === 'sin_novedad') return null
  if (estado.paso === 'disponible' && postergado) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-marca-200 bg-marca-50 px-6 py-2.5 text-sm">
      {estado.paso === 'disponible' && (
        <>
          <p className="text-marca-900">
            Hay una versión nueva del sistema{' '}
            <span className="font-medium">({estado.version})</span>. Se instala en menos de un
            minuto y el programa se reinicia.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void estado.instalar()}
              className="rounded-lg bg-marca-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-marca-600"
            >
              Actualizar ahora
            </button>
            <button
              onClick={() => setPostergado(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-marca-800 hover:bg-marca-100"
            >
              Más tarde
            </button>
          </div>
        </>
      )}

      {estado.paso === 'bajando' && (
        <p className="text-marca-900">
          Bajando la versión nueva
          {estado.porcentaje !== null ? ` — ${estado.porcentaje}%` : '…'}. No cierres el programa.
        </p>
      )}

      {estado.paso === 'listo' && (
        <p className="text-marca-900">Actualizado. El programa se está reiniciando…</p>
      )}

      {estado.paso === 'falló' && (
        <p className="text-red-700">
          No se pudo actualizar: {estado.motivo}. Se puede seguir trabajando con esta versión.
        </p>
      )}
    </div>
  )
}
