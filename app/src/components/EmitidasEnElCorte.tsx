import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { comprobantesDelCorte, faltanSubir } from '@/lib/local/comprobante'
import { imprimirComprobante, puedeImprimirSolo } from '@/lib/comprobante/imprimirDirecto'
import { abrirComprobante } from '@/lib/escritorio'
import { useTerminal } from '@/lib/terminal'
import { botonChico } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  Lo que esta computadora facturó mientras no había internet.

  Son las facturas emitidas con CAEA: ya se imprimieron y se entregaron,
  así que acá no hay nada que autorizar ni corregir. La pantalla existe
  para dos cosas concretas del día después de un corte:

  · **Reimprimir.** El cliente vuelve con el ticket arrugado, o el papel
    salió mal. El comprobante está en esta máquina y se puede volver a
    sacar con o sin conexión.
  · **Ver qué falta que llegue al servidor.** Mientras no suba, esa
    factura existe sólo acá — y es la única copia.

  Informarle a ARCA lo emitido lo hace la tarea diaria, sola. Acá no hay
  botón para eso a propósito: un botón que alguien tiene que acordarse
  de apretar no es una obligación cumplida.
*/
export default function EmitidasEnElCorte() {
  const { terminal } = useTerminal()
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const datos = useQuery({
    queryKey: ['comprobantes-del-corte'],
    queryFn: async () => ({
      comprobantes: await comprobantesDelCorte(),
      pendientes: await faltanSubir(),
    }),
    refetchInterval: 30_000,
  })

  const reimprimir = useMutation({
    mutationFn: (id: string) => imprimirComprobante(id, terminal),
    onSuccess: () => {
      setError(null)
      setAviso('El ticket salió de nuevo.')
      setTimeout(() => setAviso(null), 4000)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo imprimir.'),
  })

  const lista = datos.data?.comprobantes ?? []
  if (!lista.length) return null

  const pendientes = datos.data?.pendientes ?? new Set<string>()

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
      <div className="border-b border-borde bg-piedra-50 px-5 py-3">
        <p className="font-medium text-tinta">
          {lista.length} {lista.length === 1 ? 'factura emitida' : 'facturas emitidas'} sin conexión
        </p>
        <p className="text-sm text-piedra-500">
          Salieron con CAEA, el código que ARCA entrega por adelantado para los cortes. Ya se
          entregaron: acá sólo se reimprimen y se controla que hayan llegado al servidor.
        </p>
      </div>

      {aviso && (
        <p className="border-b border-verde-200 bg-verde-50 px-5 py-2 text-sm text-verde-800">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <table className="w-full text-sm">
        <thead className="border-b border-borde text-left text-xs tracking-wide text-piedra-500 uppercase">
          <tr>
            <th className="px-5 py-2 font-medium">Comprobante</th>
            <th className="py-2 font-medium">Cliente</th>
            <th className="py-2 text-right font-medium">Total</th>
            <th className="py-2 font-medium">En el servidor</th>
            <th className="w-40 px-5 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {lista.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-2">
                <span className="font-medium text-tinta">
                  {String(c.punto_venta).padStart(4, '0')}-{String(c.numero).padStart(8, '0')}
                </span>
                <span className="ml-2 text-xs text-piedra-500">
                  {c.tipo_descripcion} · {c.fecha}
                </span>
              </td>
              <td className="py-2 text-piedra-600">{c.receptor_nombre}</td>
              <td className="py-2 text-right tabular-nums text-tinta">{moneda.format(c.total)}</td>
              <td className="py-2">
                {pendientes.has(c.id) ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Falta subir
                  </span>
                ) : (
                  <span className="rounded-full bg-verde-100 px-2 py-0.5 text-xs font-medium text-verde-800">
                    Llegó
                  </span>
                )}
              </td>
              <td className="px-5 py-2 text-right">
                {puedeImprimirSolo(terminal) ? (
                  <button
                    onClick={() => reimprimir.mutate(c.id)}
                    disabled={reimprimir.isPending}
                    className={botonChico.secundario}
                  >
                    {reimprimir.isPending ? 'Imprimiendo…' : 'Reimprimir'}
                  </button>
                ) : (
                  <button onClick={() => abrirComprobante(c.id)} className={botonChico.secundario}>
                    Ver
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
