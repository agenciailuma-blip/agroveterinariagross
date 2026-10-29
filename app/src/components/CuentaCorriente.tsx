import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ETIQUETA_MOVIMIENTO, movimientosCuentaCorriente } from '@/lib/api/clientes'
import type { Cliente } from '@/lib/api/clientes'
import { cajaAbierta } from '@/lib/api/caja'
import { numeroRecibo, type ReciboEmitido } from '@/lib/api/recibos'
import ModalCobranza from '@/components/ModalCobranza'
import RemitoFirmado from '@/components/RemitoFirmado'
import { firmasDeVentas } from '@/lib/api/remitoFirmado'
import { numeroNoFiscal } from '@/lib/api/noFiscal'
import { useTerminal } from '@/lib/terminal'
import { moneda } from '@/lib/tipos'

const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function CuentaCorriente({
  cliente,
  saldo,
  puedeCobrar,
  onCambio,
}: {
  cliente: Cliente
  saldo: number
  puedeCobrar: boolean
  onCambio: () => void
}) {
  const qc = useQueryClient()
  const { terminal } = useTerminal()
  const [cobrando, setCobrando] = useState(false)
  const [recibo, setRecibo] = useState<ReciboEmitido | null>(null)

  const movimientos = useQuery({
    queryKey: ['movimientos-cc', cliente.id],
    queryFn: () => movimientosCuentaCorriente(cliente.id),
  })

  // El remito firmado de cada venta, si ya subieron la foto.
  const ventas = (movimientos.data ?? [])
    .filter((m) => m.referencia_tipo === 'venta' && m.tipo === 'venta' && m.referencia_id)
    .map((m) => m.referencia_id!)
  const firmas = useQuery({
    queryKey: ['remitos-firmados', 'ventas', ventas],
    queryFn: () => firmasDeVentas(ventas),
    enabled: ventas.length > 0,
  })

  const caja = useQuery({
    queryKey: ['caja', terminal?.id],
    queryFn: () => cajaAbierta(terminal!.id),
    enabled: !!terminal,
  })

  if (!cliente.cuenta_corriente) {
    return (
      <div className="rounded-xl border border-dashed border-borde bg-white/60 p-10 text-center">
        <p className="text-sm text-piedra-500">
          Este cliente no tiene cuenta corriente habilitada. Se activa en la pestaña de datos.
        </p>
      </div>
    )
  }

  const disponible = cliente.limite_credito != null ? cliente.limite_credito - saldo : null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <p className="text-xs font-medium text-piedra-500">Saldo</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              saldo > 0 ? 'text-tinta' : 'text-verde-700'
            }`}
          >
            {moneda.format(saldo)}
          </p>
          <p className="text-xs text-piedra-400">{saldo > 0 ? 'nos debe' : 'sin deuda'}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <p className="text-xs font-medium text-piedra-500">Límite</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-tinta">
            {cliente.limite_credito != null ? moneda.format(cliente.limite_credito) : '—'}
          </p>
          <p className="text-xs text-piedra-400">
            {cliente.limite_credito != null ? 'tope de crédito' : 'sin límite'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <p className="text-xs font-medium text-piedra-500">Disponible</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              disponible != null && disponible < 0 ? 'text-red-700' : 'text-tinta'
            }`}
          >
            {disponible != null ? moneda.format(disponible) : '—'}
          </p>
          <p className="text-xs text-piedra-400">
            {disponible != null && disponible < 0 ? 'excedido' : 'puede seguir comprando'}
          </p>
        </div>
      </div>

      {/*
        El resumen para mandarle al cliente. Va siempre, también con saldo
        cero: un cliente que pagó todo puede pedir el detalle de lo que
        compró y pagó en el mes.
      */}
      <Link
        to={`/cuenta-corriente/${cliente.id}`}
        className="inline-block rounded-lg px-4 py-2.5 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
      >
        Resumen de cuenta (PDF)
      </Link>

      {recibo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-verde-50 px-4 py-3 ring-1 ring-verde-200">
          <p className="text-sm font-medium text-verde-800">
            Recibo {numeroRecibo(recibo.serie, recibo.numero)} por {moneda.format(recibo.total)}.
          </p>
          <Link
            to={`/recibo/${recibo.id}`}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
          >
            Imprimir o mandar por mail
          </Link>
        </div>
      )}

      {puedeCobrar && saldo > 0 && (
        <button
          onClick={() => setCobrando(true)}
          className="rounded-lg bg-verde-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-verde-500"
        >
          Registrar cobranza
        </button>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="border-b border-borde px-5 py-2.5">
          <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">Movimientos</p>
        </div>
        {/*
          Un renglón por movimiento, sin columnas de ancho fijo: la ficha
          del cliente es angosta, y con fecha, concepto, vencimiento e
          importe en columnas la tabla se desplazaba hacia el costado. El
          concepto se lleva el ancho; la fecha y el vencimiento van debajo.
        */}
        <ul className="max-h-[26rem] divide-y divide-piedra-100 overflow-y-auto text-sm">
          {movimientos.isPending && <li className="px-5 py-8 text-center text-piedra-400">Cargando…</li>}
          {!movimientos.isPending && !movimientos.data?.length && (
            <li className="px-5 py-8 text-center text-piedra-400">Todavía no hay movimientos.</li>
          )}
          {movimientos.data?.map((m) => {
            const vencido = m.importe > 0 && m.vencimiento && new Date(m.vencimiento) < new Date()
            return (
              <li key={m.id} className="flex items-start gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-tinta">{m.concepto ?? ETIQUETA_MOVIMIENTO[m.tipo]}</p>
                  <p className="text-xs text-piedra-400">
                    <span className="tabular-nums">{fecha.format(new Date(m.ocurrido_en))}</span>
                    {' · '}
                    {ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo}
                    {m.usuario && ` · ${m.usuario.nombre}`}
                    {m.vencimiento && (
                      <span className={vencido ? 'font-medium text-red-700' : ''}>
                        {' · '}vence {fecha.format(new Date(m.vencimiento))}
                      </span>
                    )}
                  </p>
                  {(() => {
                    const firma = m.tipo === 'venta' && m.referencia_id ? firmas.data?.get(m.referencia_id) : undefined
                    return (
                      firma && (
                        <p className="text-xs text-piedra-400">
                          Remito {numeroNoFiscal('remito', firma.serie, firma.numero)} ·{' '}
                          <RemitoFirmado
                            remitoId={firma.remito_id}
                            fechaRemito={firma.firmado_el}
                            firma={firma}
                            puedeSubir={false}
                            onCambio={() => undefined}
                          />
                        </p>
                      )
                    )
                  })()}
                </div>
                <p
                  className={`shrink-0 whitespace-nowrap text-right font-medium tabular-nums ${
                    m.importe > 0 ? 'text-tinta' : 'text-verde-700'
                  }`}
                >
                  {m.importe > 0 ? '' : '−'}
                  {moneda.format(Math.abs(m.importe))}
                </p>
              </li>
            )
          })}
        </ul>
      </div>

      {cobrando && (
        <ModalCobranza
          cliente={cliente}
          saldo={saldo}
          cajaId={caja.data?.id ?? null}
          onListo={(r) => {
            setCobrando(false)
            setRecibo(r)
            qc.invalidateQueries({ queryKey: ['movimientos-cc', cliente.id] })
            onCambio()
          }}
          onCancelar={() => setCobrando(false)}
        />
      )}
    </div>
  )
}
