import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ETIQUETA_MOVIMIENTO,
  movimientosCuentaCorriente,
  registrarCobranza,
} from '@/lib/api/clientes'
import type { Cliente } from '@/lib/api/clientes'
import { cajaAbierta } from '@/lib/api/caja'
import { cargarPrecios } from '@/lib/api/precios'
import { useTerminal } from '@/lib/terminal'
import { moneda } from '@/lib/tipos'

const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function CuentaCorriente({
  cliente,
  saldo,
  usuarioId,
  puedeCobrar,
  onCambio,
}: {
  cliente: Cliente
  saldo: number
  usuarioId: string
  puedeCobrar: boolean
  onCambio: () => void
}) {
  const qc = useQueryClient()
  const { terminal } = useTerminal()
  const [cobrando, setCobrando] = useState(false)

  const movimientos = useQuery({
    queryKey: ['movimientos-cc', cliente.id],
    queryFn: () => movimientosCuentaCorriente(cliente.id),
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
        <div className="max-h-[26rem] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-piedra-100">
              {movimientos.isPending && (
                <tr>
                  <td className="px-5 py-8 text-center text-piedra-400">Cargando…</td>
                </tr>
              )}
              {!movimientos.isPending && !movimientos.data?.length && (
                <tr>
                  <td className="px-5 py-8 text-center text-piedra-400">
                    Todavía no hay movimientos.
                  </td>
                </tr>
              )}
              {movimientos.data?.map((m) => {
                const vencido =
                  m.importe > 0 && m.vencimiento && new Date(m.vencimiento) < new Date()
                return (
                  <tr key={m.id}>
                    <td className="w-28 px-5 py-2.5 text-xs text-piedra-500">
                      {fecha.format(new Date(m.ocurrido_en))}
                    </td>
                    <td className="py-2.5">
                      <p className="text-tinta">{m.concepto ?? ETIQUETA_MOVIMIENTO[m.tipo]}</p>
                      <p className="text-xs text-piedra-400">
                        {ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo}
                        {m.usuario && ` · ${m.usuario.nombre}`}
                      </p>
                    </td>
                    <td className="w-32 py-2.5 text-xs">
                      {m.vencimiento && (
                        <span className={vencido ? 'font-medium text-red-700' : 'text-piedra-400'}>
                          vence {fecha.format(new Date(m.vencimiento))}
                        </span>
                      )}
                    </td>
                    <td
                      className={`w-36 px-5 py-2.5 text-right font-medium tabular-nums ${
                        m.importe > 0 ? 'text-tinta' : 'text-verde-700'
                      }`}
                    >
                      {m.importe > 0 ? '' : '−'}
                      {moneda.format(Math.abs(m.importe))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {cobrando && (
        <ModalCobranza
          cliente={cliente}
          saldo={saldo}
          usuarioId={usuarioId}
          cajaId={caja.data?.id ?? null}
          onListo={() => {
            setCobrando(false)
            qc.invalidateQueries({ queryKey: ['movimientos-cc', cliente.id] })
            onCambio()
          }}
          onCancelar={() => setCobrando(false)}
        />
      )}
    </div>
  )
}

function ModalCobranza({
  cliente,
  saldo,
  usuarioId,
  cajaId,
  onListo,
  onCancelar,
}: {
  cliente: Cliente
  saldo: number
  usuarioId: string
  cajaId: string | null
  onListo: () => void
  onCancelar: () => void
}) {
  const [importe, setImporte] = useState(String(saldo))
  const [medioPagoId, setMedioPagoId] = useState<string>('')
  const [concepto, setConcepto] = useState('')
  const [error, setError] = useState<string | null>(null)

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios })
  const medios = (precios.data?.medios ?? []).filter((m) => m.tipo !== 'cuenta_corriente')
  const medio = medios.find((m) => m.id === medioPagoId)

  const cobrar = useMutation({
    mutationFn: () =>
      registrarCobranza({
        clienteId: cliente.id,
        importe: Number(importe),
        medioPagoId,
        cajaId,
        concepto: concepto.trim() || null,
        usuarioId,
      }),
    onSuccess: onListo,
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo registrar.'),
  })

  const faltaCaja = medio?.afecta_caja && !cajaId
  const restante = Math.round((saldo - Number(importe || 0)) * 100) / 100

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="font-semibold text-tinta">Cobranza</h2>
        <p className="mt-0.5 text-sm text-piedra-500">
          {cliente.nombre} · debe {moneda.format(saldo)}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Importe</span>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500"
            />
            {Number(importe) > 0 && (
              <span className="mt-1 block text-xs text-piedra-400">
                {restante > 0
                  ? `Queda debiendo ${moneda.format(restante)}`
                  : restante < 0
                    ? `Paga de más ${moneda.format(-restante)} — le queda a favor`
                    : 'Cancela la cuenta'}
              </span>
            )}
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-piedra-600">¿Con qué paga?</span>
            <div className="flex flex-wrap gap-1.5">
              {medios.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMedioPagoId(m.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                    medioPagoId === m.id
                      ? 'bg-marca-700 text-white ring-marca-700'
                      : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                  }`}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">
              Concepto <span className="font-normal text-piedra-400">(opcional)</span>
            </span>
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Recibo 0001-00000123"
              className="w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm outline-none focus:border-marca-500"
            />
          </label>

          {medio?.afecta_caja && cajaId && (
            <p className="rounded-lg bg-verde-50 px-3 py-2 text-xs text-verde-800 ring-1 ring-verde-200">
              Este importe también entra a la caja abierta, así el arqueo del turno lo contempla.
            </p>
          )}

          {faltaCaja && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Cobrar en {medio.nombre} mueve efectivo y no hay una caja abierta en esta terminal. Si
              se registra igual, el dinero entra y el arqueo no lo ve. Abrí la caja primero.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => cobrar.mutate()}
            disabled={!medioPagoId || Number(importe) <= 0 || faltaCaja || cobrar.isPending}
            className="flex-1 rounded-lg bg-verde-600 px-4 py-2.5 font-medium text-white hover:bg-verde-500 disabled:opacity-40"
          >
            {cobrar.isPending ? 'Registrando…' : 'Registrar cobranza'}
          </button>
          <button
            onClick={onCancelar}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
