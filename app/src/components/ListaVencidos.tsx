import type { ClienteConVencidos } from '@/lib/api/vencidos'
import { moneda } from '@/lib/tipos'

/*
  La pestaña *Vencidos* de Clientes: un bloque por cliente, con lo que
  debe vencido y el detalle de cada comprobante. Tocar el cliente abre su
  cuenta corriente, que es donde se le cobra.
*/
export default function ListaVencidos({
  clientes,
  seleccionado,
  onAbrir,
}: {
  clientes: ClienteConVencidos[]
  seleccionado: string | null
  onAbrir: (clienteId: string) => void
}) {
  return (
    <ul className="divide-y divide-piedra-100">
      {clientes.map((c) => (
        <li
          key={c.cliente_id}
          onClick={() => onAbrir(c.cliente_id)}
          className={`cursor-pointer px-4 py-3 ${
            c.cliente_id === seleccionado ? 'bg-marca-50' : 'hover:bg-piedra-50'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium break-words text-tinta">{c.nombre}</p>
              {c.telefono && <p className="text-xs text-piedra-400">{c.telefono}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-red-700">{moneda.format(c.total)}</p>
              <p className={`text-xs ${c.dias > 60 ? 'font-medium text-red-700' : 'text-piedra-500'}`}>
                {c.dias === 1 ? 'hace 1 día' : `hace ${c.dias} días`}
              </p>
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {c.comprobantes.map((v) => (
              <li key={v.movimiento_id} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="break-words text-piedra-600">{v.concepto ?? 'Cargo'}</p>
                  <p className="text-piedra-400">
                    venció el {new Date(`${v.vencimiento}T12:00:00`).toLocaleDateString('es-AR')} ·{' '}
                    {v.dias === 1 ? '1 día' : `${v.dias} días`}
                    {v.pendiente < v.importe && ` · de ${moneda.format(v.importe)}`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-piedra-600">{moneda.format(v.pendiente)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
