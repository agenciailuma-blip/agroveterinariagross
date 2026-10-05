import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ETIQUETA_MOVIMIENTO,
  movimientosCuentaCorriente,
  registrarCobranza,
} from '@/lib/api/clientes'
import type { Cliente } from '@/lib/api/clientes'
import { cajaAbierta } from '@/lib/api/caja'
import { cargarPrecios } from '@/lib/api/precios'
import { chequeVacio, cobrarConCheques, faltaEnCheque } from '@/lib/api/cheques'
import type { DatosCheque } from '@/lib/api/cheques'
import { enCastellano } from '@/lib/errores'
import CamposCheque from '@/components/CamposCheque'
import { useTerminal } from '@/lib/terminal'
import { moneda } from '@/lib/tipos'
import { avanzarConEnter } from '@/lib/teclado'

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
  /*
    Con cheque, lo que se paga es la suma de los cheques: cada uno con
    su importe, porque cada uno se deposita, se endosa o rebota por su
    cuenta.
  */
  const [cheques, setCheques] = useState<{ datos: DatosCheque; importe: string }[]>([])

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios })
  const medios = (precios.data?.medios ?? []).filter((m) => m.tipo !== 'cuenta_corriente')
  const medio = medios.find((m) => m.id === medioPagoId)
  const conCheque = medio?.tipo === 'cheque'

  const importeCheques = Math.round(cheques.reduce((s, c) => s + (Number(c.importe.replace(',', '.')) || 0), 0) * 100) / 100
  const aCobrar = conCheque ? importeCheques : Number(importe || 0)
  const chequeIncompleto =
    conCheque &&
    (cheques.length === 0 ||
      cheques.some((c) => faltaEnCheque(c.datos) || !(Number(c.importe.replace(',', '.')) > 0)))

  function elegir(id: string) {
    setMedioPagoId(id)
    const m = medios.find((x) => x.id === id)
    // El primer cheque arranca con lo que debe, igual que el importe.
    if (m?.tipo === 'cheque' && cheques.length === 0) {
      setCheques([{ datos: chequeVacio(cliente.nombre), importe: importe || String(saldo) }])
    }
  }

  const cobrar = useMutation({
    mutationFn: () =>
      conCheque
        ? cobrarConCheques({
            clienteId: cliente.id,
            cheques: cheques.map((c) => ({ datos: c.datos, importe: Number(c.importe.replace(',', '.')) })),
            concepto: concepto.trim() || null,
            usuarioId,
          })
        : registrarCobranza({
            clienteId: cliente.id,
            importe: Number(importe),
            medioPagoId,
            cajaId,
            concepto: concepto.trim() || null,
            usuarioId,
          }),
    onSuccess: onListo,
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar.')),
  })

  const faltaCaja = medio?.afecta_caja && !cajaId
  const restante = Math.round((saldo - aCobrar) * 100) / 100

  return (
    // Con varios cheques la ventana crece hacia abajo: se desplaza entera,
    // en vez de quedar cortada arriba y abajo.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4">
      <div className={`mx-auto my-8 w-full rounded-xl bg-white p-6 shadow-xl ${conCheque ? 'max-w-2xl' : 'max-w-md'}`} onKeyDown={avanzarConEnter}>
        <h2 className="font-semibold text-tinta">Cobranza</h2>
        <p className="mt-0.5 text-sm text-piedra-500">
          {cliente.nombre} · debe {moneda.format(saldo)}
        </p>

        <div className="mt-4 space-y-3">
          {!conCheque && (
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
            </label>
          )}
          {aCobrar > 0 && (
            <span className="block text-xs text-piedra-400">
              {conCheque && `Los cheques suman ${moneda.format(aCobrar)}. `}
              {restante > 0
                ? `Queda debiendo ${moneda.format(restante)}`
                : restante < 0
                  ? `Paga de más ${moneda.format(-restante)} — le queda a favor`
                  : 'Cancela la cuenta'}
            </span>
          )}

          <div>
            <span className="mb-1 block text-xs font-medium text-piedra-600">¿Con qué paga?</span>
            <div className="flex flex-wrap gap-1.5">
              {medios.map((m) => (
                <button
                  key={m.id}
                  onClick={() => elegir(m.id)}
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

          {conCheque && (
            <div className="space-y-2">
              {cheques.map((c, i) => (
                <div key={i} className="rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-piedra-600">Cheque {i + 1}</span>
                    {cheques.length > 1 && (
                      <button
                        onClick={() => setCheques(cheques.filter((_, j) => j !== i))}
                        className="rounded px-2 py-0.5 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <CamposCheque
                    valor={c.datos}
                    onChange={(d) => setCheques(cheques.map((x, j) => (j === i ? { ...x, datos: d } : x)))}
                    importe={c.importe}
                    onImporte={(t) => setCheques(cheques.map((x, j) => (j === i ? { ...x, importe: t } : x)))}
                    autoFocus={i === cheques.length - 1}
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  setCheques([
                    ...cheques,
                    { datos: chequeVacio(cliente.nombre), importe: restante > 0 ? String(restante) : '' },
                  ])
                }
                className="text-sm font-medium text-marca-700 hover:underline"
              >
                + Otro cheque
              </button>
              <p className="text-xs text-piedra-500">
                Los cheques quedan en la cartera y no entran a la caja: se depositan o se endosan desde
                Tesorería.
              </p>
            </div>
          )}

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
            disabled={!medioPagoId || aCobrar <= 0 || faltaCaja || chequeIncompleto || cobrar.isPending}
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
