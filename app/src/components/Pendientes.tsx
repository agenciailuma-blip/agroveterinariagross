import { useQuery, useQueryClient } from '@tanstack/react-query'
import { descartarLote, listarPendientes } from '@/lib/local/sync'
import { useSync } from '@/lib/local/SyncProvider'
import { confirmar } from '@/components/Dialogo'
import { agruparSinEnviar, type CosaSinEnviar } from '@/lib/sinEnviar'

const hora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const ESTADO: Record<CosaSinEnviar['estado'], { texto: string; clase: string }> = {
  trabada: { texto: 'Trabada', clase: 'bg-red-100 text-red-800' },
  enviando: { texto: 'Enviando', clase: 'bg-marca-100 text-marca-800' },
  esperando: { texto: 'En camino', clase: 'bg-piedra-100 text-piedra-600' },
}

/*
  Qué quedó sin enviar, en el idioma de quien atiende.

  Una cosa por venta o papel, no una por renglón o pago. Cada una dice si
  va a llegar sola o si alguien tiene que hacer algo, y qué. El mensaje
  original de la base queda escondido en «Detalle para soporte».
*/
export function Pendientes() {
  const { sinSubir, enLinea, sincronizando, sincronizar } = useSync()
  const qc = useQueryClient()

  const lista = useQuery({
    queryKey: ['pendientes-sync'],
    queryFn: listarPendientes,
    refetchInterval: 5000,
  })

  if (!sinSubir) return null

  const cosas = agruparSinEnviar(lista.data ?? [])
  const trabadas = cosas.filter((c) => c.estado === 'trabada').length

  async function descartar(c: CosaSinEnviar) {
    const sigue = await confirmar({
      titulo: `¿Descartar ${c.titulo}?`,
      detalle:
        'Se borra de esta computadora lo que faltaba enviar' +
        (c.detras > 0 ? ' (también el cobro y los pagos que esperaban detrás)' : '') +
        '. No va a llegar nunca al sistema central y no se puede recuperar.\n\nAnotá antes qué era.',
      aceptar: 'Descartar',
      peligro: true,
    })
    if (!sigue) return
    await descartarLote(c.lote)
    qc.invalidateQueries({ queryKey: ['pendientes-sync'] })
    void sincronizar()
  }

  return (
    <div className="max-h-[75vh] overflow-y-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">
        {sinSubir === 1 ? '1 cosa sin enviar' : `${sinSubir} cosas sin enviar`}
      </h2>
      <p className="mt-1 text-sm text-piedra-600">
        {enLinea
          ? 'Se hicieron en esta computadora y todavía no llegaron al sistema central. Hasta que lleguen, las otras PC no las ven.'
          : 'Se hicieron en esta computadora sin internet. Llegan solas cuando vuelva la conexión.'}
      </p>
      {trabadas > 0 && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {trabadas === 1
            ? 'Una no puede entrar sola: abajo dice qué hacer.'
            : `${trabadas} no pueden entrar solas: abajo dice qué hacer con cada una.`}
        </p>
      )}
      {enLinea && (
        <button
          onClick={() => void sincronizar()}
          disabled={sincronizando}
          className="mt-3 rounded-lg bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-50"
        >
          {sincronizando ? 'Enviando…' : 'Reintentar ahora'}
        </button>
      )}

      <ul className="mt-3 divide-y divide-piedra-100">
        {cosas.map((c) => {
          const e = ESTADO[c.estado]
          return (
            <li key={c.lote} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words text-tinta">{c.titulo}</p>
                  <p className="text-xs text-piedra-400">Hecha el {hora.format(new Date(c.creado_en))}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>
                  {e.texto}
                </span>
              </div>

              {c.motivo && (
                <div className="mt-1.5 space-y-1 text-sm">
                  <p className={c.estado === 'trabada' ? 'text-red-800' : 'text-piedra-600'}>
                    {c.parteTrabada && c.estado === 'trabada' && (
                      <span className="break-words">No entra {c.parteTrabada}. </span>
                    )}
                    {c.motivo.que}
                  </p>
                  <p className="text-piedra-600">
                    <span className="font-medium">Qué hacer:</span> {c.motivo.hacer}
                  </p>
                  {c.detras > 0 && c.estado === 'trabada' && (
                    <p className="text-xs text-piedra-500">
                      {c.detras === 1 ? 'Una parte más espera' : `${c.detras} partes más esperan`} a que esto se
                      resuelva (por ejemplo, el cobro).
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                    {c.estado === 'trabada' && (
                      <button
                        onClick={() => void descartar(c)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Descartar
                      </button>
                    )}
                    {c.trabada?.ultimo_error && (
                      <details className="text-xs text-piedra-400">
                        <summary className="cursor-pointer hover:text-piedra-600">Detalle para soporte</summary>
                        <p className="mt-1 break-words">{c.trabada.ultimo_error}</p>
                      </details>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
