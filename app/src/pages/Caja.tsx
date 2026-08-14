import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import { useAuth } from '@/auth/AuthProvider'
import { IdentificarOperador, useOperador } from '@/components/IdentificarOperador'
import {
  abrirCaja,
  ajustarTotal,
  aplicarLista,
  cajaAbierta,
  cerrarCaja,
  cobrar,
  listarVentasEnCola,
  obtenerVentaCompleta,
  resumenCaja,
  saldoCuentaCorriente,
} from '@/lib/api/caja'
import type { PagoNuevo, VentaCompleta } from '@/lib/api/caja'
import { cargarPrecios } from '@/lib/api/precios'
import type { MedioPago } from '@/lib/api/precios'
import { moneda, numero } from '@/lib/tipos'

export default function Caja() {
  const { terminal, cargando: cargandoTerminal } = useTerminal()
  const { operador, identificar, salir } = useOperador()
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [pagos, setPagos] = useState<PagoNuevo[]>([])
  const [medioPrincipal, setMedioPrincipal] = useState<string | null>(null)
  const [cuotas, setCuotas] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)

  const caja = useQuery({
    queryKey: ['caja', terminal?.id],
    queryFn: () => cajaAbierta(terminal!.id),
    enabled: !!terminal,
  })

  const cola = useQuery({
    queryKey: ['cola-caja'],
    queryFn: listarVentasEnCola,
    refetchInterval: 8000, // el mostrador manda ventas mientras la caja trabaja
  })

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios, staleTime: 300_000 })

  const venta = useQuery({
    queryKey: ['venta', seleccionada],
    queryFn: () => obtenerVentaCompleta(seleccionada!),
    enabled: !!seleccionada,
  })

  const saldo = useQuery({
    queryKey: ['saldo-cc', venta.data?.cliente?.id],
    queryFn: () => saldoCuentaCorriente(venta.data!.cliente!.id),
    enabled: !!venta.data?.cliente?.id && venta.data.cliente.cuenta_corriente,
  })

  const medios = precios.data?.medios ?? []

  // Al elegir con qué se paga, la venta se recalcula con la lista de ese
  // medio. Siempre desde el precio acordado, así cambiar de opinión no
  // acumula recargos ni pisa las rebajas del vendedor.
  const aplicar = useMutation({
    mutationFn: async ({ m, n }: { m: MedioPago; n: number }) => {
      const total = await aplicarLista(seleccionada!, m.lista_precio_id)
      const recargo =
        m.medio_pago_cuota.find((c) => c.cuotas === n)?.recargo_porcentaje ?? 0
      const conRecargo = Math.round(total * (1 + recargo / 100) * 100) / 100
      return { total, conRecargo }
    },
    onSuccess: ({ conRecargo }, { m, n }) => {
      setPagos([{ medio_pago_id: m.id, importe: conRecargo, cuotas: n, referencia: null }])
      qc.invalidateQueries({ queryKey: ['venta', seleccionada] })
      setError(null)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo aplicar la lista.'),
  })

  function elegirMedio(m: MedioPago, n = 1) {
    setMedioPrincipal(m.id)
    setCuotas(n)
    aplicar.mutate({ m, n })
  }

  const ajustar = useMutation({
    mutationFn: ({ nuevo, motivo }: { nuevo: number; motivo: string }) =>
      ajustarTotal(seleccionada!, nuevo, motivo, operador!.usuario_id),
    onSuccess: (nuevoTotal) => {
      setPagos((prev) =>
        prev.length === 1 ? [{ ...prev[0], importe: nuevoTotal }] : prev,
      )
      qc.invalidateQueries({ queryKey: ['venta', seleccionada] })
      setError(null)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo ajustar.'),
  })

  const totalVenta = venta.data?.total ?? 0
  const totalPagos = pagos.reduce((s, p) => s + p.importe, 0)
  const diferencia = Math.round((totalPagos - totalVenta) * 100) / 100

  const cobrarVenta = useMutation({
    mutationFn: () => cobrar(seleccionada!, caja.data!.id, operador!.usuario_id, pagos),
    onSuccess: () => {
      setExito(`Venta ${venta.data?.codigo} cobrada`)
      setTimeout(() => setExito(null), 4000)
      limpiar()
      qc.invalidateQueries({ queryKey: ['cola-caja'] })
      qc.invalidateQueries({ queryKey: ['resumen-caja'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo cobrar.'),
  })

  function limpiar() {
    setSeleccionada(null)
    setPagos([])
    setMedioPrincipal(null)
    setCuotas(1)
    setError(null)
  }

  useEffect(() => {
    setPagos([])
    setMedioPrincipal(null)
    setCuotas(1)
    setError(null)
  }, [seleccionada])

  if (cargandoTerminal || caja.isPending) return <p className="text-sm text-piedra-500">Cargando…</p>

  if (!terminal)
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        Esta máquina todavía no tiene terminal asignada. Entrá a Ventas para elegirla.
      </p>
    )

  if (terminal.tipo !== 'caja')
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        <span className="font-medium">{terminal.nombre}</span> está configurada como{' '}
        {terminal.tipo}, no como caja. Sólo las cajas pueden cobrar, porque son las que tienen punto
        de venta de ARCA e impresora.
      </p>
    )

  if (!operador)
    return (
      <div className="-m-6 min-h-[calc(100vh-3.5rem)]">
        <IdentificarOperador onIdentificado={identificar} />
      </div>
    )

  if (!caja.data)
    return <AbrirCaja terminalId={terminal.id} cajeroId={operador.usuario_id} onAbierta={() => caja.refetch()} />

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-80 shrink-0 flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Caja</h1>
          <p className="text-sm text-piedra-500">
            {terminal.nombre} · <span className="font-medium text-tinta">{operador.nombre}</span>
            <button onClick={salir} className="ml-2 text-marca-700 hover:underline">
              cambiar
            </button>
          </p>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <div className="border-b border-borde px-4 py-2.5">
            <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Esperando cobro {cola.data?.length ? `· ${cola.data.length}` : ''}
            </p>
          </div>
          <div className="h-full overflow-y-auto">
            {!cola.data?.length && (
              <p className="px-4 py-10 text-center text-sm text-piedra-400">
                No hay ventas esperando.
              </p>
            )}
            {cola.data?.map((v) => (
              <button
                key={v.id}
                onClick={() => setSeleccionada(v.id)}
                className={`block w-full border-b border-piedra-100 px-4 py-3 text-left last:border-0 ${
                  v.id === seleccionada ? 'bg-marca-50' : 'hover:bg-piedra-50'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-piedra-400">{v.codigo}</span>
                  <span className="font-semibold tabular-nums text-tinta">
                    {moneda.format(v.total)}
                  </span>
                </div>
                <p className="truncate text-sm text-tinta">{v.cliente?.nombre}</p>
                <p className="truncate text-xs text-piedra-400">{v.vendedor?.nombre}</p>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setCerrando(true)}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
        >
          Cerrar caja
        </button>
      </div>

      <div className="min-w-0 flex-1">
        {exito && (
          <p className="mb-3 rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
            {exito}
          </p>
        )}

        {!seleccionada ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-borde bg-white/60">
            <p className="text-sm text-piedra-400">Elegí una venta de la cola para cobrarla.</p>
          </div>
        ) : venta.isPending ? (
          <p className="text-sm text-piedra-500">Cargando venta…</p>
        ) : venta.data ? (
          <PanelCobro
            venta={venta.data}
            medios={medios}
            medioPrincipal={medioPrincipal}
            cuotas={cuotas}
            pagos={pagos}
            setPagos={setPagos}
            diferencia={diferencia}
            saldoActual={saldo.data ?? 0}
            aplicando={aplicar.isPending}
            cobrando={cobrarVenta.isPending}
            ajustando={ajustar.isPending}
            puedeAjustar={tienePermiso('ventas.ajustar_total')}
            error={error}
            onElegirMedio={elegirMedio}
            onAjustar={(nuevo, motivo) => ajustar.mutate({ nuevo, motivo })}
            onCobrar={() => cobrarVenta.mutate()}
            onCancelar={limpiar}
          />
        ) : null}
      </div>

      {cerrando && caja.data && (
        <ModalCierre
          cajaId={caja.data.id}
          montoInicial={caja.data.monto_inicial}
          onCerrada={() => {
            setCerrando(false)
            limpiar()
            caja.refetch()
          }}
          onCancelar={() => setCerrando(false)}
        />
      )}
    </div>
  )
}

function AbrirCaja({
  terminalId,
  cajeroId,
  onAbierta,
}: {
  terminalId: string
  cajeroId: string
  onAbierta: () => void
}) {
  const [monto, setMonto] = useState('0')
  const [error, setError] = useState<string | null>(null)

  const abrir = useMutation({
    mutationFn: () => abrirCaja(terminalId, cajeroId, Number(monto) || 0),
    onSuccess: onAbierta,
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo abrir.'),
  })

  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-borde">
        <h1 className="font-semibold text-tinta">Abrir caja</h1>
        <p className="mt-1 text-sm text-piedra-500">
          ¿Con cuánto efectivo arranca el turno? Es contra este número que se va a arquear al
          cerrar.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Monto inicial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => abrir.mutate()}
          disabled={abrir.isPending}
          className="mt-4 w-full rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-60"
        >
          {abrir.isPending ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </div>
    </div>
  )
}

function PanelCobro({
  venta,
  medios,
  medioPrincipal,
  cuotas,
  pagos,
  setPagos,
  diferencia,
  saldoActual,
  aplicando,
  cobrando,
  ajustando,
  puedeAjustar,
  error,
  onElegirMedio,
  onAjustar,
  onCobrar,
  onCancelar,
}: {
  venta: VentaCompleta
  medios: MedioPago[]
  medioPrincipal: string | null
  cuotas: number
  pagos: PagoNuevo[]
  setPagos: (p: PagoNuevo[]) => void
  diferencia: number
  saldoActual: number
  aplicando: boolean
  cobrando: boolean
  ajustando: boolean
  puedeAjustar: boolean
  error: string | null
  onElegirMedio: (m: MedioPago, cuotas?: number) => void
  onAjustar: (nuevoTotal: number, motivo: string) => void
  onCobrar: () => void
  onCancelar: () => void
}) {
  const usables = medios.filter(
    (m) => m.tipo !== 'cuenta_corriente' || venta.cliente?.cuenta_corriente,
  )
  const medio = medios.find((m) => m.id === medioPrincipal)
  const esCuentaCorriente = medio?.tipo === 'cuenta_corriente'
  const nuevoSaldo = saldoActual + (pagos.find((p) => p.medio_pago_id === medio?.id)?.importe ?? 0)
  const excede =
    esCuentaCorriente &&
    venta.cliente?.limite_credito != null &&
    nuevoSaldo > venta.cliente.limite_credito

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="flex items-baseline justify-between border-b border-borde px-5 py-3">
          <div>
            <p className="font-mono text-xs text-piedra-400">{venta.codigo}</p>
            <p className="font-medium text-tinta">{venta.cliente?.nombre}</p>
          </div>
          <p className="text-xs text-piedra-400">vendió {venta.vendedor?.nombre}</p>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-piedra-100">
            {venta.venta_linea.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-2">
                  <p className="text-tinta">{l.descripcion}</p>
                  {l.motivo_modificacion && (
                    <p className="text-xs text-marca-700">
                      Precio modificado: {l.motivo_modificacion}
                    </p>
                  )}
                </td>
                <td className="w-20 py-2 text-center tabular-nums text-piedra-500">
                  ×{numero.format(l.cantidad)}
                </td>
                <td className="w-32 py-2 text-right tabular-nums text-piedra-500">
                  {moneda.format(l.precio_unitario)}
                </td>
                <td className="w-32 px-5 py-2 text-right font-medium tabular-nums text-tinta">
                  {moneda.format(l.cantidad * l.precio_unitario)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
        <p className="mb-3 text-xs font-medium tracking-wide text-piedra-400 uppercase">
          ¿Cómo paga?
        </p>
        <div className="flex flex-wrap gap-2">
          {usables.map((m) =>
            m.admite_cuotas ? (
              Array.from({ length: m.cuotas_maximas }, (_, i) => i + 1).map((n) => (
                <button
                  key={`${m.id}-${n}`}
                  onClick={() => onElegirMedio(m, n)}
                  disabled={aplicando}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium ring-1 transition-colors disabled:opacity-50 ${
                    medioPrincipal === m.id && cuotas === n
                      ? 'bg-marca-700 text-white ring-marca-700'
                      : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                  }`}
                >
                  {m.nombre} · {n} {n === 1 ? 'cuota' : 'cuotas'}
                </button>
              ))
            ) : (
              <button
                key={m.id}
                onClick={() => onElegirMedio(m)}
                disabled={aplicando}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium ring-1 transition-colors disabled:opacity-50 ${
                  medioPrincipal === m.id
                    ? 'bg-marca-700 text-white ring-marca-700'
                    : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                }`}
              >
                {m.nombre}
              </button>
            ),
          )}
        </div>

        {medio && (
          <div className="mt-4 space-y-3 border-t border-borde pt-4">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-tinta">Total a cobrar</span>
              <div className="flex items-baseline gap-3">
                {puedeAjustar && (
                  <button
                    onClick={() => {
                      const propuesto = window.prompt(
                        `Total actual: ${moneda.format(venta.total)}\n¿En cuánto queda?`,
                        String(Math.round(venta.total)),
                      )
                      if (propuesto === null) return
                      const nuevo = Number(propuesto)
                      if (!Number.isFinite(nuevo) || nuevo <= 0) return
                      const motivo = window.prompt('¿Por qué se ajusta?', 'Redondeo al cliente')
                      if (!motivo || motivo.trim().length < 3) return
                      onAjustar(nuevo, motivo.trim())
                    }}
                    disabled={ajustando || aplicando}
                    className="text-sm font-medium text-marca-700 hover:underline disabled:opacity-40"
                  >
                    {ajustando ? 'Ajustando…' : 'Ajustar'}
                  </button>
                )}
                <span className="text-2xl font-semibold tabular-nums text-tinta">
                  {moneda.format(venta.total)}
                </span>
              </div>
            </div>

            {/*
              Si ya hubo un ajuste a mano y después se cambia el medio de
              pago, el importe se rescala en proporción. Conviene avisarlo:
              cuando la tarjeta no pasa y se termina pagando en efectivo,
              la rebaja normalmente se vuelve a conversar.
            */}
            {venta.venta_linea.some((l) => l.motivo_modificacion) && (
              <p className="rounded-lg bg-marca-50 px-3 py-2 text-xs text-marca-800 ring-1 ring-marca-200">
                Esta venta tiene precios ajustados a mano. Si cambiás el medio de pago se recalculan
                en proporción — verificá el total antes de cobrar.
              </p>
            )}

            {pagos.map((p, i) => {
              const mp = medios.find((x) => x.id === p.medio_pago_id)
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-piedra-600">{mp?.nombre}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={p.importe}
                    onChange={(e) =>
                      setPagos(
                        pagos.map((x, j) =>
                          j === i ? { ...x, importe: Number(e.target.value) || 0 } : x,
                        ),
                      )
                    }
                    className="w-36 rounded-lg border border-borde px-2.5 py-1.5 text-right tabular-nums outline-none focus:border-marca-500"
                  />
                  {pagos.length > 1 && (
                    <button
                      onClick={() => setPagos(pagos.filter((_, j) => j !== i))}
                      className="rounded p-1 text-piedra-300 hover:bg-red-50 hover:text-red-600"
                      aria-label="Quitar"
                    >
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}

            {Math.abs(diferencia) > 0.009 && (
              <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm ring-1 ring-amber-200">
                <span className="text-amber-800">
                  {diferencia < 0 ? 'Falta cubrir' : 'Los pagos exceden el total en'}
                </span>
                <span className="font-medium tabular-nums text-amber-900">
                  {moneda.format(Math.abs(diferencia))}
                </span>
              </div>
            )}

            {diferencia < -0.009 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="self-center text-xs text-piedra-500">Completar con:</span>
                {usables
                  .filter((m) => !pagos.some((p) => p.medio_pago_id === m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() =>
                        setPagos([
                          ...pagos,
                          {
                            medio_pago_id: m.id,
                            importe: Math.round(-diferencia * 100) / 100,
                            cuotas: 1,
                            referencia: null,
                          },
                        ])
                      }
                      className="rounded-full px-2.5 py-1 text-xs font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
                    >
                      {m.nombre}
                    </button>
                  ))}
              </div>
            )}

            {esCuentaCorriente && venta.cliente && (
              <div
                className={`rounded-lg px-3 py-2 text-xs ring-1 ${
                  excede
                    ? 'bg-red-50 text-red-800 ring-red-200'
                    : 'bg-piedra-50 text-piedra-600 ring-borde'
                }`}
              >
                Saldo actual {moneda.format(saldoActual)} · queda en {moneda.format(nuevoSaldo)}
                {venta.cliente.limite_credito != null &&
                  ` · límite ${moneda.format(venta.cliente.limite_credito)}`}
                {excede && ' — excede el límite, la caja va a rechazar el cobro.'}
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCobrar}
            disabled={!medio || Math.abs(diferencia) > 0.009 || cobrando || aplicando}
            className="flex-1 rounded-lg bg-verde-600 px-4 py-3 font-medium text-white hover:bg-verde-500 disabled:opacity-40"
          >
            {cobrando ? 'Cobrando…' : 'Cobrar'}
          </button>
          <button
            onClick={onCancelar}
            className="rounded-lg px-4 py-3 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalCierre({
  cajaId,
  montoInicial,
  onCerrada,
  onCancelar,
}: {
  cajaId: string
  montoInicial: number
  onCerrada: () => void
  onCancelar: () => void
}) {
  const [declarado, setDeclarado] = useState('')
  const [resultado, setResultado] = useState<{ esperado: number; diferencia: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resumen = useQuery({ queryKey: ['resumen-caja', cajaId], queryFn: () => resumenCaja(cajaId) })

  const cerrar = useMutation({
    mutationFn: () => cerrarCaja(cajaId, Number(declarado) || 0),
    onSuccess: (r) => setResultado({ esperado: r.esperado, diferencia: r.diferencia }),
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo cerrar.'),
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="font-semibold text-tinta">Cerrar caja</h2>

        {resultado ? (
          <div className="mt-4 space-y-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-piedra-500">El sistema esperaba</dt>
                <dd className="tabular-nums text-tinta">{moneda.format(resultado.esperado)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-piedra-500">Contaste</dt>
                <dd className="tabular-nums text-tinta">{moneda.format(Number(declarado))}</dd>
              </div>
              <div
                className={`flex justify-between border-t border-borde pt-1.5 font-medium ${
                  Math.abs(resultado.diferencia) < 0.01
                    ? 'text-verde-700'
                    : resultado.diferencia > 0
                      ? 'text-marca-700'
                      : 'text-red-700'
                }`}
              >
                <dt>Diferencia</dt>
                <dd className="tabular-nums">{moneda.format(resultado.diferencia)}</dd>
              </div>
            </dl>
            <button
              onClick={onCerrada}
              className="w-full rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600"
            >
              Listo
            </button>
          </div>
        ) : (
          <>
            <dl className="mt-3 space-y-1 text-sm text-piedra-600">
              <div className="flex justify-between">
                <dt>Monto inicial</dt>
                <dd className="tabular-nums">{moneda.format(montoInicial)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Ventas cobradas</dt>
                <dd className="tabular-nums">{resumen.data?.ventas ?? '—'}</dd>
              </div>
            </dl>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                ¿Cuánto efectivo hay en la caja?
              </span>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={declarado}
                onChange={(e) => setDeclarado(e.target.value)}
                className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500"
              />
              <span className="mt-1 block text-xs text-piedra-400">
                Contalo antes de mirar el número que espera el sistema. Si no, el arqueo no sirve
                para nada.
              </span>
            </label>

            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => cerrar.mutate()}
                disabled={declarado === '' || cerrar.isPending}
                className="flex-1 rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-40"
              >
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja'}
              </button>
              <button
                onClick={onCancelar}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
