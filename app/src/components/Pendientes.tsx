import { useQuery, useQueryClient } from '@tanstack/react-query'
import { descartarOperacion, listarPendientes } from '@/lib/local/sync'
import { useSync } from '@/lib/local/SyncProvider'

const hora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'Esperando', clase: 'bg-piedra-100 text-piedra-600' },
  enviando: { texto: 'Enviando', clase: 'bg-marca-100 text-marca-800' },
  error: { texto: 'Falló', clase: 'bg-red-100 text-red-800' },
}

/*
  Qué quedó sin subir.

  No es una pantalla de diagnóstico para el desarrollador: es lo que el
  encargado necesita para poder responder "¿la venta de recién entró?".
  Sin esto, una operación que falla desaparece en silencio y el sistema
  pierde credibilidad de una forma que después no se recupera.
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

  const conError = (lista.data ?? []).filter((o) => o.estado === 'error')

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-tinta">
            {sinSubir} {sinSubir === 1 ? 'operación sin subir' : 'operaciones sin subir'}
          </h2>
          <p className="text-xs text-piedra-500">
            {enLinea
              ? 'Están guardadas en esta computadora y se envían solas.'
              : 'Están guardadas en esta computadora. Se envían cuando vuelva la conexión.'}
          </p>
        </div>
        {enLinea && (
          <button
            onClick={() => void sincronizar()}
            disabled={sincronizando}
            className="rounded-lg bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-50"
          >
            {sincronizando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        )}
      </div>

      <ul className="mt-3 divide-y divide-piedra-100">
        {(lista.data ?? []).slice(0, 12).map((op) => {
          const e = ESTADO[op.estado] ?? ESTADO.pendiente
          return (
            <li key={op.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-tinta">{op.descripcion}</p>
                <p className="text-xs text-piedra-400">
                  {hora.format(new Date(op.creado_en))}
                  {op.intentos > 0 && ` · ${op.intentos} intento${op.intentos === 1 ? '' : 's'}`}
                </p>
                {op.ultimo_error && (
                  <p className="mt-0.5 text-xs text-red-700">{op.ultimo_error}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>
                {e.texto}
              </span>
            </li>
          )
        })}
      </ul>

      {/*
        Descartar sólo aparece para las que fallaron de verdad. Una
        operación que todavía puede entrar no se ofrece borrar: sería
        tirar una venta por impaciencia.
      */}
      {conError.length > 0 && (
        <details className="mt-3 border-t border-borde pt-3">
          <summary className="cursor-pointer text-xs text-piedra-500 hover:text-tinta">
            {conError.length} con error · opciones
          </summary>
          <p className="mt-2 text-xs text-piedra-500">
            Si una operación falla siempre por el mismo motivo, se puede descartar — pero eso
            significa que ese dato no va a existir en el sistema. Anotá antes qué era.
          </p>
          <div className="mt-2 space-y-1">
            {conError.map((op) => (
              <div key={op.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-piedra-600">{op.descripcion}</span>
                <button
                  onClick={async () => {
                    if (!window.confirm(`¿Descartar "${op.descripcion}"? No se va a poder recuperar.`))
                      return
                    await descartarOperacion(op.id)
                    qc.invalidateQueries({ queryKey: ['pendientes-sync'] })
                    void sincronizar()
                  }}
                  className="shrink-0 text-red-600 hover:underline"
                >
                  Descartar
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
