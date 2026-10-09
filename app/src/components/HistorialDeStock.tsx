import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { movimientosDeProducto, nombreDelMovimiento, quienYDonde } from '@/lib/api/movimientos'
import { enCastellano } from '@/lib/errores'
import { numero } from '@/lib/tipos'

/*
  Los movimientos de stock de un producto: cómo llegó al número que
  muestra. Cada uno con cuándo pasó, qué fue, quién y en qué máquina, y
  cuánto quedó después.

  Va en la ficha del producto, cerrado —la ficha se abre sobre todo para
  cambiar un precio—, y en cada fila de Stock, donde se abre cuando un
  número no cierra. Recién al abrirlo se le pregunta a la base.
*/

const PRIMEROS = 20
const DE_A = 50

function cuando(fecha: string) {
  const d = new Date(fecha)
  const esteAnio = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    ...(esteAnio ? {} : { year: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
    // «18:54» y no «06:54 p. m.»: entra en un renglón y se lee igual que el reloj del local.
    hour12: false,
  })
}

interface Props {
  productoId: string
  /** Con un depósito elegido, sus movimientos y su saldo. */
  depositoId?: string | null
  /** Con más de un depósito, cada movimiento dice en cuál pasó. */
  conDeposito?: boolean
  /** En Stock se abre desde la fila: sin el botón propio. */
  siempreAbierto?: boolean
}

export default function HistorialDeStock({ productoId, depositoId = null, conDeposito = false, siempreAbierto = false }: Props) {
  const [abierto, setAbierto] = useState(siempreAbierto)
  const [limite, setLimite] = useState(PRIMEROS)

  const historia = useQuery({
    queryKey: ['movimientos-producto', productoId, depositoId, limite],
    queryFn: () => movimientosDeProducto(productoId, limite, depositoId),
    enabled: abierto,
    placeholderData: (anterior) => anterior,
  })

  const filas = historia.data?.filas ?? []
  const total = historia.data?.total ?? 0

  return (
    <div className="col-span-2 sm:col-span-4">
      {!siempreAbierto && (
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          className="flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:underline"
        >
          <svg
            className={`size-3.5 transition-transform ${abierto ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Movimientos de stock
        </button>
      )}

      {abierto && (
        <div className={`${siempreAbierto ? '' : 'mt-2'} rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde`}>
          {historia.isPending && <p className="text-xs text-piedra-500">Cargando…</p>}
          {historia.isError && (
            <p className="text-xs text-red-700">{enCastellano(historia.error, 'No se pudo traer el historial.')}</p>
          )}
          {!historia.isPending && !historia.isError && filas.length === 0 && (
            <p className="text-xs text-piedra-500">Este producto todavía no tuvo ningún movimiento de stock.</p>
          )}

          {/*
            Un movimiento por renglón, el más nuevo arriba. A la derecha,
            cuánto movió y cuánto quedó: leyendo la columna de abajo hacia
            arriba se ve cómo se llegó al número de hoy.
          */}
          <ul className="divide-y divide-piedra-100 text-sm">
            {filas.map((m) => {
              const detalle = quienYDonde(m, conDeposito)
              return (
                <li key={m.id} className="flex items-start gap-3 py-1.5">
                  <span className="w-[4.5rem] shrink-0 text-xs leading-5 tabular-nums text-piedra-500">
                    {cuando(m.ocurrido_en)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-tinta">
                      {nombreDelMovimiento(m.tipo)}
                      {m.registrado_offline && (
                        <span className="ml-1.5 rounded bg-piedra-200 px-1 py-px text-[10px] text-piedra-600 align-middle">
                          sin internet
                        </span>
                      )}
                    </span>
                    {m.motivo && <span className="block text-xs break-words text-piedra-500">{m.motivo}</span>}
                    {detalle && <span className="block text-xs break-words text-piedra-400">{detalle}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={`block tabular-nums font-medium ${m.cantidad < 0 ? 'text-red-700' : 'text-verde-700'}`}
                    >
                      {m.cantidad > 0 ? '+' : ''}
                      {numero.format(m.cantidad)}
                    </span>
                    <span className="block text-xs tabular-nums text-piedra-500">queda {numero.format(m.saldo)}</span>
                  </span>
                </li>
              )
            })}
          </ul>

          {total > filas.length && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2 text-xs text-piedra-500">
              <span>
                Los últimos {numero.format(filas.length)} de {numero.format(total)}.
              </span>
              <button
                type="button"
                onClick={() => setLimite(limite + DE_A)}
                disabled={historia.isFetching}
                className="font-medium text-marca-700 hover:underline disabled:opacity-40"
              >
                {historia.isFetching ? 'Trayendo…' : 'Ver más'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
