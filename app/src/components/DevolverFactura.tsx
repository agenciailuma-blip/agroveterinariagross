import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import DevolucionParcial from '@/components/DevolucionParcial'
import {
  comprobantePorId,
  devolucionesPosibles,
  devolverVenta,
  ventasDeFactura,
  type FilaComprobante,
} from '@/lib/api/facturacion'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Devolver una factura desde donde se la encontró

  Auditoría de integralidad, punto 3. La devolución estaba sólo en la
  lista de Facturación, que muestra las últimas 200: una factura de hace
  dos meses se encontraba en Facturas emitidas, en la cuenta del cliente
  o en un pedido, y no se podía devolver en ninguno. Ahora la vista de
  cualquier comprobante la ofrece, con las mismas reglas y las mismas
  ventanas que Facturación.
  ─────────────────────────────────────────────────────────────
*/

export default function DevolverFactura({ comprobanteId }: { comprobanteId: string }) {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puedeEmitir = tienePermiso('facturacion.emitir')

  const fila = useQuery({
    queryKey: ['comprobante-fila', comprobanteId],
    queryFn: () => comprobantePorId(comprobanteId),
    enabled: puedeEmitir,
  })
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null)
  const [parte, setParte] = useState<FilaComprobante | null>(null)
  const [viendoVentas, setViendoVentas] = useState(false)

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['comprobante-fila', comprobanteId] })
    qc.invalidateQueries({ queryKey: ['comprobantes'] })
    qc.invalidateQueries({ queryKey: ['movimientos-cc'] })
  }

  const devolver = useMutation({
    mutationFn: ({ ventaId, motivo }: { ventaId: string; motivo: string }) => devolverVenta(ventaId, motivo),
    onSuccess: ({ notaCreditoId, cae, problema }) => {
      if (!notaCreditoId) setAviso({ texto: 'Venta anulada. No estaba facturada, así que no hace falta nota de crédito.', error: false })
      else if (problema)
        setAviso({
          texto: `La devolución se hizo y la nota de crédito quedó armada, pero ARCA no la autorizó todavía: ${problema} Se puede reintentar desde Comprobantes → Facturación.`,
          error: true,
        })
      else setAviso({ texto: `Nota de crédito autorizada por ARCA. CAE ${cae}`, error: false })
      refrescar()
    },
    onError: (e) => {
      setAviso({ texto: e instanceof Error ? e.message : 'No se pudo hacer la devolución.', error: true })
      refrescar()
    },
  })

  const c = fila.data
  if (!c) return null
  const posibles = devolucionesPosibles(c, puedeEmitir)
  const agrupadaConAlgo = posibles.agrupada && puedeEmitir && c.estado === 'autorizado' && c.queda_por_devolver

  async function devolverEntera() {
    if (!c?.venta_id) return
    const motivo = await pedirTexto({
      titulo: `Devolver ${c.comprobante}`,
      detalle: `${c.receptor_nombre}\n\nSe va a reingresar el stock, sacarle la deuda al cliente y emitir la nota de crédito.`,
      etiqueta: '¿Por qué se devuelve?',
      valorInicial: 'Devolución del cliente',
      minimo: 3,
      aceptar: 'Devolver',
      peligro: true,
    })
    if (!motivo) return
    setAviso(null)
    devolver.mutate({ ventaId: c.venta_id, motivo })
  }

  const hayBotones = posibles.entera || posibles.parte || agrupadaConAlgo
  if (!hayBotones && !aviso) return null

  return (
    <div className="mx-auto mb-4 max-w-[21cm] space-y-3 px-4 print:hidden">
      {hayBotones && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-piedra-500">¿El cliente devuelve algo?</span>
          {posibles.parte && (
            <button
              onClick={() => {
                setAviso(null)
                setParte(c)
              }}
              disabled={devolver.isPending}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-marca-50 hover:text-marca-700"
            >
              Devolver una parte
            </button>
          )}
          {posibles.entera && (
            <button
              onClick={devolverEntera}
              disabled={devolver.isPending}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50"
            >
              {devolver.isPending ? 'Devolviendo…' : 'Devolver todo'}
            </button>
          )}
          {agrupadaConAlgo && !viendoVentas && (
            <button
              onClick={() => {
                setAviso(null)
                setViendoVentas(true)
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-marca-50 hover:text-marca-700"
            >
              Devolver de una de sus ventas
            </button>
          )}
        </div>
      )}

      {viendoVentas && (
        <VentasDeLaFactura
          factura={c}
          onCerrar={() => setViendoVentas(false)}
          onDevolverParte={(ventaId, codigo) => {
            setParte({ ...c, venta_id: ventaId, comprobante: `${c.comprobante} · venta ${codigo}` })
            setViendoVentas(false)
          }}
        />
      )}

      {aviso && (
        <p
          role={aviso.error ? 'alert' : undefined}
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${
            aviso.error ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-verde-50 font-medium text-verde-800 ring-verde-200'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {parte?.venta_id && (
        <DevolucionParcial
          ventaId={parte.venta_id}
          comprobante={parte.comprobante}
          cliente={parte.receptor_nombre}
          onCerrar={() => setParte(null)}
          onListo={(mensaje, problema) => {
            setAviso({ texto: mensaje, error: !!problema })
            refrescar()
          }}
        />
      )}
    </div>
  )
}

/*
  Las ventas de una factura agrupada. Para devolver algo se elige la
  venta: la nota de crédito sale por esa venta sola, asociada a la
  factura agrupada, con su parte de la percepción.
*/
export function VentasDeLaFactura({
  factura,
  onCerrar,
  onDevolverParte,
}: {
  factura: FilaComprobante
  onCerrar: () => void
  onDevolverParte: (ventaId: string, codigo: string) => void
}) {
  const ventas = useQuery({
    queryKey: ['ventas-de-factura', factura.id],
    queryFn: () => ventasDeFactura(factura.id),
  })

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-medium text-tinta">
            {factura.tipo} {factura.comprobante}
          </p>
          <p className="text-xs text-piedra-500">
            {factura.receptor_nombre} · agrupa {ventas.data?.length ?? '…'} ventas
          </p>
        </div>
        <button onClick={onCerrar} className="text-sm text-piedra-500 hover:text-tinta">
          Cerrar
        </button>
      </div>
      <ul className="mt-3 divide-y divide-piedra-100 text-sm">
        {ventas.data?.map((v) => (
          <li key={v.id} className="flex items-center gap-3 py-2">
            <span className="font-mono text-xs text-piedra-400">{v.codigo}</span>
            <span className="text-xs text-piedra-500">{new Date(v.ocurrido_en).toLocaleDateString('es-AR')}</span>
            <span className="ml-auto tabular-nums text-tinta">{moneda.format(v.total)}</span>
            <button
              onClick={() => onDevolverParte(v.id, v.codigo)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-piedra-500 ring-1 ring-borde hover:bg-marca-50 hover:text-marca-700"
            >
              Devolver parte
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
