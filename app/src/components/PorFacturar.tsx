import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { agruparPorCliente, facturarPendientes, ventasPorFacturar } from '@/lib/api/facturacion'
import { moneda } from '@/lib/tipos'
import { botonChico, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Por facturar

  Las ventas que se llevaron a cuenta corriente sin factura, porque el
  cliente no la quiso en el momento. El encargado las factura cuando
  corresponde: una sola, o varias juntas —lo del mes de ese cliente— en
  una única factura.

  Vienen marcadas todas las de cada cliente, que es el caso de fin de
  mes. Se desmarca lo que no va.

  La percepción de IIBB, si le toca, se calcula al facturar y entra a la
  cuenta del cliente: la deuda termina siendo la factura entera.
  ─────────────────────────────────────────────────────────────
*/

const fecha = (f: string) => new Date(f).toLocaleDateString('es-AR')

export default function PorFacturar({
  puedeEmitir,
  onAviso,
  onError,
}: {
  puedeEmitir: boolean
  onAviso: (texto: string) => void
  onError: (texto: string) => void
}) {
  const qc = useQueryClient()
  const pendientes = useQuery({ queryKey: ['por-facturar'], queryFn: ventasPorFacturar })
  // Las desmarcadas. Guardar lo que NO va hace que las ventas nuevas
  // aparezcan marcadas solas, que es lo que se espera a fin de mes.
  const [fuera, setFuera] = useState<Set<string>>(new Set())

  const facturar = useMutation({
    mutationFn: (ids: string[]) => facturarPendientes(ids),
    onSuccess: ({ cae, problema }) => {
      if (problema) {
        onError(`La factura quedó armada, pero ARCA no la autorizó todavía: ${problema} Se puede reintentar desde la lista de abajo.`)
      } else {
        onAviso(`Factura autorizada por ARCA. CAE ${cae}`)
      }
      qc.invalidateQueries({ queryKey: ['por-facturar'] })
      qc.invalidateQueries({ queryKey: ['comprobantes'] })
    },
    onError: (e) => onError(e instanceof Error ? e.message : 'No se pudo facturar.'),
  })

  const clientes = agruparPorCliente(pendientes.data ?? [])
  if (!clientes.length) return null

  const alternar = (id: string) =>
    setFuera((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className={`${tarjeta} overflow-hidden`}>
      <div className="border-b border-borde bg-piedra-50 px-5 py-3">
        <p className="font-medium text-tinta">Por facturar</p>
        <p className="text-xs text-piedra-500">
          Ventas a cuenta corriente que el cliente no quiso facturar en el momento. Se pueden
          facturar de a una o varias juntas en una sola factura.
        </p>
      </div>

      <div className="divide-y divide-borde">
        {clientes.map((c) => {
          const elegidas = c.ventas.filter((v) => !fuera.has(v.id))
          const total = elegidas.reduce((s, v) => s + v.total, 0)
          const conDevoluciones = elegidas.some((v) => v.tiene_devoluciones)
          return (
            <div key={c.cliente_id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-tinta">{c.cliente}</p>
                <p className="text-xs text-piedra-500">
                  {c.ventas.length} {c.ventas.length === 1 ? 'venta' : 'ventas'} ·{' '}
                  {moneda.format(c.total)}
                </p>
              </div>

              <ul className="mt-2 space-y-1 text-sm">
                {c.ventas.map((v) => (
                  <li key={v.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!fuera.has(v.id)}
                      onChange={() => alternar(v.id)}
                      aria-label={`Incluir la venta ${v.codigo}`}
                    />
                    <span className="font-mono text-xs text-piedra-400">{v.codigo}</span>
                    <span className="text-xs text-piedra-500">{fecha(v.ocurrido_en)}</span>
                    {v.tiene_devoluciones && (
                      <span className="text-xs text-amber-700">tuvo devoluciones</span>
                    )}
                    <span className="ml-auto tabular-nums text-tinta">{moneda.format(v.total)}</span>
                  </li>
                ))}
              </ul>

              {puedeEmitir && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
                  {conDevoluciones && (
                    <span className="text-xs text-amber-700">
                      Una venta con devoluciones todavía no se puede facturar desde acá.
                    </span>
                  )}
                  <button
                    onClick={() => facturar.mutate(elegidas.map((v) => v.id))}
                    disabled={!elegidas.length || conDevoluciones || facturar.isPending}
                    className={botonChico.principal}
                  >
                    {facturar.isPending
                      ? 'Facturando…'
                      : elegidas.length === 1
                        ? `Facturar ${moneda.format(total)}`
                        : `Facturar ${elegidas.length} juntas · ${moneda.format(total)}`}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="border-t border-borde px-5 py-2 text-[11px] text-piedra-400">
        Los importes no incluyen la percepción de IIBB: si le corresponde al cliente, se calcula al
        facturar y se suma a su cuenta corriente.
      </p>
    </div>
  )
}
