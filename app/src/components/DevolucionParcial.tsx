import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  devolverLineas,
  lineasDevolvibles,
  totalADevolver,
  type LineaDevolvible,
} from '@/lib/api/devoluciones'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { boton, campo } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Devolver parte de una venta

  El cliente se llevó tres bolsas y trae una. Esta pantalla es para ese
  momento, con la persona esperando del otro lado del mostrador, así que
  está armada para resolverse rápido: la lista de lo que se llevó, un
  número al lado de cada cosa, y el total a la vista mientras se marca.

  ─── EL TOTAL SE VE ANTES DE CONFIRMAR ───

  Es lo que el cajero le va a decir al cliente, y tiene que coincidir con
  la nota de crédito que sale después. Por eso se calcula con la misma
  cuenta que hace la base —prorrateando sobre lo que se cobró, no sobre
  el precio de lista— y no con una aproximación.

  ─── LO QUE YA SE DEVOLVIÓ QUEDA A LA VISTA ───

  Una venta puede tener varias devoluciones. Ver «devolviste 1 de 3»
  evita la conversación de si esta bolsa ya se había devuelto la semana
  pasada.
  ─────────────────────────────────────────────────────────────
*/
export default function DevolucionParcial({
  ventaId,
  comprobante,
  cliente,
  onCerrar,
  onListo,
}: {
  ventaId: string
  comprobante: string
  cliente: string
  onCerrar: () => void
  onListo: (mensaje: string, problema: string | null) => void
}) {
  const [elegidas, setElegidas] = useState<Map<string, number>>(new Map())
  const [motivo, setMotivo] = useState('Devolución del cliente')
  const [error, setError] = useState<string | null>(null)

  const lineas = useQuery({
    queryKey: ['lineas-devolvibles', ventaId],
    queryFn: () => lineasDevolvibles(ventaId),
  })

  const total = useMemo(
    () => (lineas.data ? totalADevolver(lineas.data, elegidas) : 0),
    [lineas.data, elegidas],
  )

  const hayAlgo = [...elegidas.values()].some((c) => c > 0)

  const devolver = useMutation({
    mutationFn: async () => {
      const seleccion = [...elegidas.entries()]
        .filter(([, cantidad]) => cantidad > 0)
        .map(([venta_linea_id, cantidad]) => ({ venta_linea_id, cantidad }))

      return devolverLineas(ventaId, seleccion, motivo.trim())
    },
    onSuccess: ({ cae, problema }) => {
      if (problema) {
        onListo(
          `La devolución se hizo por ${moneda.format(total)} y la nota de crédito quedó armada, pero ARCA no la autorizó todavía: ${problema} Se puede reintentar desde esta misma pantalla.`,
          problema,
        )
      } else if (cae) {
        onListo(
          `Devolución de ${moneda.format(total)} hecha. Nota de crédito autorizada por ARCA, CAE ${cae}`,
          null,
        )
      } else {
        onListo(
          `Devolución de ${moneda.format(total)} hecha. La venta no estaba facturada, así que no hace falta nota de crédito.`,
          null,
        )
      }
      onCerrar()
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo hacer la devolución.')),
  })

  function marcar(l: LineaDevolvible, valor: string) {
    const n = Number(valor.replace(',', '.'))
    const siguiente = new Map(elegidas)

    if (!Number.isFinite(n) || n <= 0) {
      siguiente.delete(l.venta_linea_id)
    } else {
      // El tope es lo que queda, no lo que se vendió: si ya devolvió una
      // bolsa de tres, acá el máximo son dos.
      siguiente.set(l.venta_linea_id, Math.min(n, l.disponible))
    }

    setElegidas(siguiente)
    setError(null)
  }

  function devolverTodoLoQueQueda() {
    const siguiente = new Map<string, number>()
    for (const l of lineas.data ?? []) {
      if (l.disponible > 0) siguiente.set(l.venta_linea_id, l.disponible)
    }
    setElegidas(siguiente)
    setError(null)
  }

  const disponibles = (lineas.data ?? []).filter((l) => l.disponible > 0)
  const trabajando = devolver.isPending

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !trabajando) onCerrar()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">Devolver parte de {comprobante}</h2>
        <p className="mt-1 text-sm text-piedra-600">
          {cliente} · Marcá cuánto vuelve de cada producto. La venta no se anula y el resto queda
          como está.
        </p>

        {lineas.isPending ? (
          <p className="mt-4 text-sm text-piedra-500">Buscando lo que se llevó…</p>
        ) : lineas.isError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            No se pudo traer el detalle de la venta.
          </p>
        ) : disponibles.length === 0 ? (
          <p className="mt-4 rounded-lg bg-piedra-50 px-3 py-2.5 text-sm text-piedra-600 ring-1 ring-borde">
            De esta venta ya se devolvió todo. No queda nada por devolver.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto rounded-lg ring-1 ring-borde">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde bg-piedra-50 text-left text-xs text-piedra-500">
                    <th className="px-3 py-2 font-medium">Producto</th>
                    <th className="px-3 py-2 text-right font-medium">Se llevó</th>
                    <th className="px-3 py-2 text-right font-medium">Queda</th>
                    <th className="px-3 py-2 text-right font-medium">Vuelve</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.data.map((l) => (
                    <tr key={l.venta_linea_id} className="border-b border-borde last:border-0">
                      <td className="px-3 py-2">
                        <span className="text-tinta">{l.descripcion}</span>
                        <span className="ml-2 text-xs text-piedra-400">
                          {moneda.format(l.precio_unitario)} c/u
                        </span>
                        {l.devuelta > 0 && (
                          <span className="ml-2 rounded-full bg-piedra-100 px-2 py-0.5 text-xs text-piedra-600">
                            ya volvieron {numero.format(l.devuelta)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-piedra-600">
                        {numero.format(l.vendida)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-piedra-600">
                        {numero.format(l.disponible)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.disponible > 0 ? (
                          <input
                            type="number"
                            min={0}
                            max={l.disponible}
                            step="any"
                            value={elegidas.get(l.venta_linea_id) ?? ''}
                            onChange={(e) => marcar(l, e.target.value)}
                            disabled={trabajando}
                            aria-label={`Cuánto vuelve de ${l.descripcion}`}
                            className={`${campo} w-24 text-right`}
                          />
                        ) : (
                          <span className="text-xs text-piedra-400">devuelto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={devolverTodoLoQueQueda}
                disabled={trabajando}
                className={boton.suave}
              >
                Marcar todo lo que queda
              </button>
              <p className="text-sm text-piedra-600">
                Se le devuelve{' '}
                <strong className="tabular-nums text-tinta">{moneda.format(total)}</strong>
              </p>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                ¿Por qué se devuelve?
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={trabajando}
                className={campo}
              />
            </label>

            {/*
              Lo que va a pasar al confirmar, escrito antes de confirmar.
              La nota de crédito es un comprobante fiscal: conviene que el
              cajero sepa que se emite y no la descubra después.
            */}
            <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600 ring-1 ring-borde">
              Vuelve el stock de lo marcado, se le descuenta de la cuenta corriente la parte que
              esté en cuenta, y sale una nota de crédito por {moneda.format(total)}. El efectivo lo
              entrega el cajero: el sistema no abre la caja.
            </p>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCerrar} disabled={trabajando} className={boton.suave}>
            Cancelar
          </button>
          {disponibles.length > 0 && (
            <button
              onClick={() => devolver.mutate()}
              disabled={trabajando || !hayAlgo || motivo.trim().length < 3}
              className={boton.principal}
            >
              {trabajando ? 'Devolviendo…' : `Devolver ${moneda.format(total)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
