import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import { useSync } from '@/lib/local/SyncProvider'
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
import { facturarVenta } from '@/lib/api/facturacion'
import {
  emitirNoFiscal,
  marcarDocumentacion,
  noFiscalesDeVenta,
  numeroNoFiscal,
} from '@/lib/api/noFiscal'
import { abrirComprobante, abrirNoFiscal } from '@/lib/escritorio'
import { moneda, numero } from '@/lib/tipos'

export default function Caja() {
  const { terminal, cargando: cargandoTerminal } = useTerminal()
  const { operador, identificar, salir } = useOperador()
  const { tienePermiso } = useAuth()
  const { enLinea } = useSync()
  const qc = useQueryClient()

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [pagos, setPagos] = useState<PagoNuevo[]>([])
  const [medioPrincipal, setMedioPrincipal] = useState<string | null>(null)
  const [cuotas, setCuotas] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [facturaPendiente, setFacturaPendiente] = useState<string | null>(null)
  /*
    La elección de documentación, antes de cobrar.

    Arranca siempre en 'fiscal' y hay que elegir salirse. Lo contrario
    —recordar la última elección, por ejemplo— haría que una venta salga
    sin factura porque la anterior salió así, y eso no puede pasar por
    inercia.
  */
  const [documentacion, setDocumentacion] = useState<'fiscal' | 'no_fiscal'>('fiscal')
  const [noFiscalEmitido, setNoFiscalEmitido] = useState<{ texto: string; id: string } | null>(
    null,
  )
  const [listoParaImprimir, setListoParaImprimir] = useState<{
    codigo: string
    cae: string
    comprobanteId: string | null
  } | null>(null)
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

  /*
    Cobrar y facturar son dos cosas distintas, y el orden importa.

    Una vez que cobrar_venta() volvió bien, la plata entró, el stock se
    descontó y la deuda quedó registrada. Nada de lo que pase después
    con ARCA puede deshacer eso. Por eso el pedido de CAE va adentro de
    su propio try: si ARCA no responde, la venta queda cobrada igual y
    el comprobante espera en la cola de Facturación.

    Al revés —fallar el cobro porque ARCA está caído— dejaría al cliente
    parado en el mostrador con la mercadería en la mano.
  */
  const cobrarVenta = useMutation({
    mutationFn: async () => {
      const codigo = venta.data?.codigo
      const sinFactura = documentacion === 'no_fiscal'

      /*
        La marca va ANTES del cobro, y es a propósito.

        Los dos candados —el permiso y que a un Responsable Inscripto le
        corresponde Factura A— los verifica la base. Si esta venta no
        podía cobrarse sin factura, tiene que fallar ahora, con el
        cliente todavía sin pagar; no después, con la plata adentro y un
        documento que no se puede emitir.
      */
      if (sinFactura) await marcarDocumentacion(seleccionada!, 'no_fiscal')

      const { subida } = await cobrar(seleccionada!, caja.data!.id, operador!.usuario_id, pagos)

      // Sin haber llegado al servidor no hay nada que documentar
      // todavía: el comprobante se arma sobre una venta cobrada, y para
      // el servidor esta venta sigue esperando en la cola.
      if (!subida) {
        return {
          codigo,
          cae: null,
          comprobanteId: null,
          noFiscal: null as { id: string; numero: string } | null,
          problema:
            'la venta quedó guardada en esta computadora y se va a facturar sola cuando vuelva la conexión.',
        }
      }

      if (sinFactura) {
        try {
          const noFiscalId = await emitirNoFiscal(
            seleccionada!,
            'comprobante_interno',
            terminal?.id ?? null,
          )
          const [emitido] = await noFiscalesDeVenta(seleccionada!)
          return {
            codigo,
            cae: null,
            comprobanteId: null,
            noFiscal: emitido
              ? {
                  id: noFiscalId,
                  numero: numeroNoFiscal(emitido.tipo_clave, emitido.serie, emitido.numero),
                }
              : null,
            problema: null as string | null,
          }
        } catch (e) {
          return {
            codigo,
            cae: null,
            comprobanteId: null,
            noFiscal: null,
            problema:
              e instanceof Error
                ? `no se pudo emitir el comprobante interno: ${e.message}`
                : 'no se pudo emitir el comprobante interno.',
          }
        }
      }

      try {
        const { cae, comprobanteId } = await facturarVenta(seleccionada!)
        return { codigo, cae, comprobanteId, noFiscal: null, problema: null as string | null }
      } catch (e) {
        return {
          codigo,
          cae: null,
          comprobanteId: null,
          noFiscal: null,
          problema: e instanceof Error ? e.message : 'ARCA no respondió.',
        }
      }
    },
    onSuccess: ({ codigo, cae, comprobanteId, noFiscal, problema }) => {
      if (problema) {
        setFacturaPendiente(`Venta ${codigo} cobrada, pero la factura quedó pendiente: ${problema}`)
      } else if (noFiscal) {
        // Igual que con la factura: el papel queda a un clic, no
        // escondido en otra pantalla. El cliente está parado adelante.
        setNoFiscalEmitido({
          id: noFiscal.id,
          texto: `Venta ${codigo} cobrada sin factura. Comprobante interno ${noFiscal.numero}.`,
        })
      } else {
        /*
          El comprobante queda a un clic, no escondido en otra pantalla.

          El cajero tiene que entregarle algo al cliente que está parado
          adelante: mandarlo a buscarlo a Facturación es una pantalla de
          más en el peor momento. No se abre solo porque el navegador
          bloquea las ventanas que no abrió una persona.
        */
        setListoParaImprimir({ codigo: codigo ?? '', cae: cae ?? '', comprobanteId })
      }
      limpiar()
      qc.invalidateQueries({ queryKey: ['cola-caja'] })
      qc.invalidateQueries({ queryKey: ['resumen-caja'] })
      qc.invalidateQueries({ queryKey: ['comprobantes'] })
      qc.invalidateQueries({ queryKey: ['ventas-sin-facturar'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo cobrar.'),
  })

  function limpiar() {
    setSeleccionada(null)
    setPagos([])
    setMedioPrincipal(null)
    setCuotas(1)
    setError(null)
    setDocumentacion('fiscal')
  }

  useEffect(() => {
    setPagos([])
    setMedioPrincipal(null)
    setCuotas(1)
    setError(null)
    // Cada venta decide de nuevo. Que la anterior se haya cobrado sin
    // factura no dice nada de esta, y arrastrar la elección haría que
    // una venta salga sin factura porque nadie miró el selector.
    setDocumentacion('fiscal')
  }, [seleccionada])

  /*
    Si se corta internet con "sin factura" ya elegido, vuelve a factura.

    Marcar la venta necesita servidor. Sin esto, el cajero apretaría
    Cobrar y fallaría el cobro entero —no la marca, el cobro— justo en el
    momento en que el sistema tiene que seguir funcionando igual. Prefiere
    cobrar de más con factura que no cobrar.
  */
  useEffect(() => {
    if (!enLinea) setDocumentacion('fiscal')
  }, [enLinea])

  /*
    Lo que el vendedor ya preguntó, queda elegido.

    El vendedor le pregunta al cliente cómo va a pagar porque lo necesita
    para decirle el precio. Si la caja arranca en blanco, el cajero
    vuelve a preguntar lo mismo con el cliente adelante — y encima puede
    elegir otro medio y cobrar un precio distinto del que se dijo.

    Queda igual de editable: la tarjeta puede no pasar.
  */
  const ventaId = venta.data?.id
  const previsto = venta.data?.medio_pago_previsto_id
  useEffect(() => {
    if (!previsto || !medios.length || medioPrincipal) return
    const m = medios.find((x) => x.id === previsto)
    if (m) elegirMedio(m, venta.data?.cuotas_previstas ?? 1)
    // Sólo al abrir la venta: después manda lo que elija el cajero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId, previsto, medios.length])

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
        <IdentificarOperador terminalId={terminal.id} onIdentificado={identificar} />
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
        {/* Cobrado y facturado: lo único que falta es entregarlo. */}
        {listoParaImprimir && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-verde-50 px-4 py-3 ring-1 ring-verde-200">
            <div className="min-w-0">
              <p className="font-medium text-verde-900">
                Venta {listoParaImprimir.codigo} cobrada y facturada
              </p>
              <p className="text-xs text-verde-800">CAE {listoParaImprimir.cae}</p>
            </div>
            <div className="flex items-center gap-2">
              {listoParaImprimir.comprobanteId && (
                <button
                  onClick={() => abrirComprobante(listoParaImprimir.comprobanteId!)}
                  className="rounded-lg bg-verde-600 px-4 py-2 text-sm font-medium text-white hover:bg-verde-500"
                >
                  Imprimir comprobante
                </button>
              )}
              <button
                onClick={() => setListoParaImprimir(null)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-verde-800 hover:bg-verde-100"
              >
                Listo
              </button>
            </div>
          </div>
        )}

        {/*
          Cobrada sin factura, a propósito.

          Va en gris y no en verde ni en ámbar: no es un éxito que
          festejar ni un problema que resolver, es una constancia. El
          número está para que el cajero pueda nombrarlo si el cliente
          pregunta.
        */}
        {noFiscalEmitido && (
          <div className="mb-3 flex items-start gap-3 rounded-xl bg-piedra-50 px-4 py-3 ring-1 ring-borde">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-tinta">{noFiscalEmitido.texto}</p>
              <p className="text-xs text-piedra-500">
                No es una factura y no tiene CAE. Queda registrado con tu nombre.
              </p>
            </div>
            <button
              onClick={() => abrirNoFiscal(noFiscalEmitido.id)}
              className="shrink-0 rounded-lg bg-tinta px-3 py-2 text-sm font-medium text-white hover:bg-tinta/90"
            >
              Imprimir
            </button>
            <button
              onClick={() => setNoFiscalEmitido(null)}
              className="rounded p-1 text-piedra-500 hover:bg-piedra-100"
              aria-label="Entendido"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/*
          Este aviso NO se va solo. La venta se cobró pero no tiene
          comprobante: alguien tiene que enterarse y resolverlo, no que
          se le desvanezca de la pantalla mientras atiende al que sigue.
        */}
        {facturaPendiente && (
          <div className="mb-3 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900">{facturaPendiente}</p>
              <Link to="/facturacion" className="text-xs text-amber-800 underline">
                Ir a Facturación para reintentar
              </Link>
            </div>
            <button
              onClick={() => setFacturaPendiente(null)}
              className="rounded p-1 text-amber-700 hover:bg-amber-100"
              aria-label="Entendido"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
            documentacion={documentacion}
            onDocumentacion={setDocumentacion}
            puedeVenderSinFactura={tienePermiso('facturacion.vender_sin_factura')}
            enLinea={enLinea}
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
          terminalId={terminal.id}
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
  documentacion,
  onDocumentacion,
  puedeVenderSinFactura,
  enLinea,
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
  documentacion: 'fiscal' | 'no_fiscal'
  onDocumentacion: (d: 'fiscal' | 'no_fiscal') => void
  puedeVenderSinFactura: boolean
  enLinea: boolean
  error: string | null
  onElegirMedio: (m: MedioPago, cuotas?: number) => void
  onAjustar: (nuevoTotal: number, motivo: string) => void
  onCobrar: () => void
  onCancelar: () => void
}) {
  const usables = medios.filter(
    (m) => m.tipo !== 'cuenta_corriente' || venta.cliente?.cuenta_corriente,
  )

  // Lo que el vendedor dejó anotado, para que el cajero no vuelva a
  // preguntarlo y para que se note si termina cobrando con otra cosa.
  const mPrevisto = medios.find((m) => m.id === venta.medio_pago_previsto_id)
  const avisoPrevisto = mPrevisto
    ? mPrevisto.admite_cuotas && (venta.cuotas_previstas ?? 1) > 1
      ? `${mPrevisto.nombre} · ${venta.cuotas_previstas} cuotas`
      : mPrevisto.nombre
    : null
  const medio = medios.find((m) => m.id === medioPrincipal)
  const esCuentaCorriente = medio?.tipo === 'cuenta_corriente'
  // 1 es "IVA Responsable Inscripto" en la tabla de ARCA.
  const esResponsableInscripto = venta.cliente?.condicion_iva_id === 1
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
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">¿Cómo paga?</p>
          {avisoPrevisto && (
            <p className="text-xs text-marca-700">
              El vendedor anotó: <strong>{avisoPrevisto}</strong>
            </p>
          )}
        </div>
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

        {/*
          Con qué documento sale la venta.

          Sólo aparece si el permiso lo habilita: emitir un presupuesto o
          un remito es operación diaria, pero decidir que una venta no
          lleve factura es una decisión del dueño. A un Responsable
          Inscripto no se le ofrece — compra para descargar el IVA, y
          entregarle otra cosa es un problema para él. La base rechaza
          las dos cosas igual; esto sólo evita ofrecer lo que va a fallar.
        */}
        {puedeVenderSinFactura && !esResponsableInscripto && (
          <div className="mt-4 rounded-lg border border-borde p-1">
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ['fiscal', 'Con factura', 'Factura de ARCA con CAE'],
                  ['no_fiscal', 'Sin factura', 'Comprobante interno'],
                ] as const
              ).map(([valor, titulo, detalle]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={documentacion === valor}
                  disabled={valor === 'no_fiscal' && !enLinea}
                  onClick={() => onDocumentacion(valor)}
                  className={`rounded-md px-3 py-2 text-left transition disabled:opacity-40 ${
                    documentacion === valor
                      ? valor === 'fiscal'
                        ? 'bg-verde-600 text-white'
                        : 'bg-tinta text-white'
                      : 'text-piedra-500 enabled:hover:bg-piedra-100'
                  }`}
                >
                  <span className="block text-sm font-medium">{titulo}</span>
                  <span
                    className={`block text-[11px] ${
                      documentacion === valor ? 'text-white/70' : 'text-piedra-400'
                    }`}
                  >
                    {detalle}
                  </span>
                </button>
              ))}
            </div>
            {!enLinea && (
              <p className="px-3 pb-1.5 pt-2 text-[11px] leading-snug text-piedra-500">
                Sin conexión sólo se puede cobrar con factura. Podés cobrar igual: la factura se
                emite sola cuando vuelva internet.
              </p>
            )}
            {enLinea && documentacion === 'no_fiscal' && (
              <p className="px-3 pb-1.5 pt-2 text-[11px] leading-snug text-piedra-500">
                No es una factura, no tiene CAE y no se puede entregar como tal. La venta se
                registra igual: descuenta stock, queda en la cuenta del cliente y lleva tu nombre.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCobrar}
            disabled={!medio || Math.abs(diferencia) > 0.009 || cobrando || aplicando}
            className={`flex-1 rounded-lg px-4 py-3 font-medium text-white disabled:opacity-40 ${
              documentacion === 'no_fiscal'
                ? 'bg-tinta hover:bg-tinta/90'
                : 'bg-verde-600 hover:bg-verde-500'
            }`}
          >
            {cobrando
              ? 'Cobrando…'
              : documentacion === 'no_fiscal'
                ? 'Cobrar sin factura'
                : 'Cobrar'}
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
  terminalId,
  montoInicial,
  onCerrada,
  onCancelar,
}: {
  cajaId: string
  terminalId: string
  montoInicial: number
  onCerrada: () => void
  onCancelar: () => void
}) {
  const [declarado, setDeclarado] = useState('')
  const [resultado, setResultado] = useState<{ esperado: number; diferencia: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resumen = useQuery({ queryKey: ['resumen-caja', cajaId], queryFn: () => resumenCaja(cajaId) })

  const cerrar = useMutation({
    mutationFn: () => cerrarCaja(cajaId, terminalId, Number(declarado) || 0),
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
