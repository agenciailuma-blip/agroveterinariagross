import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { cajaAbierta } from '@/lib/api/caja'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import ModalCobranza from '@/components/ModalCobranza'
import { filtrarClientes, leerClientes } from '@/lib/api/mayorista'
import {
  encolarOrden,
  enviarOrdenes,
  enviarReciboPorMail,
  etiquetaForma,
  FORMAS_DE_COBRO,
  leerImporte,
  listarOrdenes,
  numeroRecibo,
  ordenesEnCola,
  reciboCompleto,
  rechazarOrden,
  sacarOrdenDeLaCola,
  type FormaDeCobro,
  type OrdenArmada,
  type OrdenRecibo,
  type ReciboEmitido,
  type VistaOrdenes,
} from '@/lib/api/recibos'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Cobros del vendedor de calle — la orden de recibo

  Fase 03, punto 5.4. El cliente le paga a Facundo —le transfiere y le
  muestra el comprobante, le da efectivo o un cheque— y Facundo arma la
  orden. No baja la deuda: eso pasa en el local, cuando confirman que la
  plata entró y aceptan la orden. Ahí sale el recibo numerado, baja la
  cuenta y se le manda por mail al cliente.

  Igual que el pedido: sin señal, la orden queda en el teléfono y sale
  sola cuando vuelve.
  ─────────────────────────────────────────────────────────────
*/

const VISTAS: { valor: VistaOrdenes; etiqueta: string }[] = [
  { valor: 'pendientes', etiqueta: 'Por confirmar' },
  { valor: 'aceptadas', etiqueta: 'Con recibo' },
  { valor: 'rechazadas', etiqueta: 'Rechazadas' },
]

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

/* La cola del teléfono, al día. Sale sola apenas vuelve la señal. */
function useCola(alEnviar: (numeros: number[]) => void) {
  const [cola, setCola] = useState<OrdenArmada[]>(ordenesEnCola)

  useEffect(() => {
    const actualizar = () => setCola(ordenesEnCola())
    const mandar = () => {
      enviarOrdenes()
        .then((r) => {
          if (r.enviadas > 0) alEnviar(r.numeros)
        })
        .catch(() => {})
    }
    window.addEventListener('gross-mayorista-cobros', actualizar)
    window.addEventListener('online', mandar)
    if (navigator.onLine && ordenesEnCola().length > 0) mandar()
    return () => {
      window.removeEventListener('gross-mayorista-cobros', actualizar)
      window.removeEventListener('online', mandar)
    }
    // alEnviar cambia en cada dibujo y no hace falta volver a suscribirse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return cola
}

export default function MayoristaCobros() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [vista, setVista] = useState<VistaOrdenes>('pendientes')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const arma = tienePermiso('mayorista.cobrar')
  // Aceptar es cobrar: el mismo permiso que la cobranza en la ficha del cliente.
  const acepta = tienePermiso('cuentacorriente.cobrar')

  const clienteParaArmar = params.get('cliente')
  const [armando, setArmando] = useState(arma && clienteParaArmar !== null)

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['ordenes-recibo'] })
    qc.invalidateQueries({ queryKey: ['ordenes-recibo-pendientes'] })
    qc.invalidateQueries({ queryKey: ['mayorista-clientes'] })
  }

  function avisar(m: string) {
    setError(null)
    setAviso(m)
  }

  function fallar(m: string) {
    setAviso(null)
    setError(m)
  }

  const cola = useCola((numeros) => {
    avisar(numeros.length === 1 ? `Llegó al local la orden ${numeros[0]}.` : `Llegaron al local ${numeros.length} órdenes.`)
    refrescar()
  })

  const ordenes = useQuery({
    queryKey: ['ordenes-recibo', vista],
    queryFn: () => listarOrdenes(vista),
    enabled: arma || acepta,
    refetchInterval: acepta ? 60_000 : false,
  })

  if (!arma && !acepta) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para los cobros mayoristas.
      </p>
    )
  }

  if (armando) {
    const cerrar = () => {
      setArmando(false)
      if (clienteParaArmar) setParams({}, { replace: true })
    }
    return (
      <ArmarOrden
        clienteInicial={clienteParaArmar}
        onCerrar={cerrar}
        onListo={(m) => {
          cerrar()
          avisar(m)
          refrescar()
        }}
      />
    )
  }

  const filas = ordenes.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Cobros</h1>
          <p className="text-sm text-piedra-500">
            {acepta
              ? 'Lo que el vendedor de calle dice que cobró: confirmar que entró la plata y emitir el recibo.'
              : 'Lo que te pagaron en la calle. El local confirma que entró la plata y emite el recibo.'}
          </p>
        </div>
        {arma && (
          <button onClick={() => setArmando(true)} className={boton.principal}>
            Nueva orden de recibo
          </button>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">{aviso}</p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {cola.length > 0 && (
        <Cola
          cola={cola}
          onEnviadas={(n) => {
            avisar(n === 1 ? 'Llegó al local la orden.' : `Llegaron al local ${n} órdenes.`)
            refrescar()
          }}
        />
      )}

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-piedra-100 p-1">
        {VISTAS.map((v) => (
          <button
            key={v.valor}
            onClick={() => setVista(v.valor)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              vista === v.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      {ordenes.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : ordenes.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {navigator.onLine
            ? enCastellano(ordenes.error, 'No se pudieron leer las órdenes.')
            : 'Sin señal no se ven las órdenes. Las que armes igual se guardan en el teléfono.'}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">
            {vista === 'pendientes' ? 'No hay órdenes por confirmar.' : 'No hay órdenes acá en los últimos 60 días.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filas.map((o) => (
            <FilaOrden
              key={o.id}
              o={o}
              verVendedor={acepta}
              puedeResolver={acepta && o.estado === 'pendiente'}
              onAviso={(m) => {
                avisar(m)
                refrescar()
              }}
              onError={(m) => {
                fallar(m)
                refrescar()
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Lo que quedó en el teléfono
// ───────────────────────────────────────────────────────────────

function Cola({ cola, onEnviadas }: { cola: OrdenArmada[]; onEnviadas: (n: number) => void }) {
  const mandar = useMutation({
    mutationFn: enviarOrdenes,
    onSuccess: (r) => {
      if (r.enviadas > 0) onEnviadas(r.enviadas)
    },
  })

  return (
    <section className="space-y-2 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-amber-900">
          {cola.length === 1 ? 'Una orden' : `${cola.length} órdenes`} en el teléfono, sin llegar al local
        </p>
        <button onClick={() => mandar.mutate()} disabled={mandar.isPending} className={botonChico.principal}>
          {mandar.isPending ? 'Mandando…' : 'Mandar ahora'}
        </button>
      </div>
      <p className="text-xs text-amber-800">Salen solas cuando vuelve la señal.</p>
      <ul className="space-y-1.5">
        {cola.map((o) => (
          <li key={o.id} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 truncate font-medium text-tinta">{o.cliente_nombre}</span>
              <span className="tabular-nums text-piedra-600">{moneda.format(o.importe)}</span>
            </div>
            <p className="text-xs text-piedra-500">
              {etiquetaForma(o.forma)} · armada el {fechaHora(o.armado_en)}
            </p>
            {o.error && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-red-700">El local no la aceptó: {o.error}</p>
                <button
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: 'Descartar esta orden',
                      detalle: `La de ${o.cliente_nombre}. No llegó al local; si la descartás, hay que armarla de nuevo.`,
                      aceptar: 'Descartar',
                      peligro: true,
                    })
                    if (ok) sacarOrdenDeLaCola(o.id)
                  }}
                  className={botonChico.suave}
                >
                  Descartar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ───────────────────────────────────────────────────────────────
// Armar la orden, en el teléfono
// ───────────────────────────────────────────────────────────────

function ArmarOrden({
  clienteInicial,
  onCerrar,
  onListo,
}: {
  clienteInicial: string | null
  onCerrar: () => void
  onListo: (mensaje: string) => void
}) {
  const clientes = useQuery({ queryKey: ['mayorista-clientes'], queryFn: leerClientes, staleTime: 5 * 60_000 })
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial)
  const [buscarCliente, setBuscarCliente] = useState('')
  const [importe, setImporte] = useState('')
  const [forma, setForma] = useState<FormaDeCobro>('transferencia')
  const [detalle, setDetalle] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cliente = clientes.data?.datos.find((c) => c.id === clienteId) ?? null
  const encontrados = useMemo(
    () => filtrarClientes(clientes.data?.datos ?? [], { texto: buscarCliente, ruta: '', soloConVencido: false }).slice(0, 40),
    [clientes.data, buscarCliente],
  )
  const monto = leerImporte(importe)

  async function alMandar() {
    if (!cliente || monto === null) return
    setEnviando(true)
    const orden: OrdenArmada = {
      id: crypto.randomUUID(),
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      importe: monto,
      forma,
      detalle: detalle.trim(),
      armado_en: new Date().toISOString(),
    }
    // Primero en el teléfono: si la señal se corta a mitad de camino, no se pierde.
    encolarOrden(orden)
    try {
      const r = await enviarOrdenes()
      const enviada = !ordenesEnCola().some((o) => o.id === orden.id)
      onListo(
        enviada
          ? `Orden ${r.numeros[r.numeros.length - 1] ?? ''} de ${cliente.nombre} por ${moneda.format(monto)}: llegó al local.`
          : `Sin señal: la orden de ${cliente.nombre} quedó en el teléfono y sale sola cuando vuelva.`,
      )
    } catch {
      onListo(`La orden de ${cliente.nombre} quedó en el teléfono: sale sola cuando vuelva la señal.`)
    } finally {
      setEnviando(false)
    }
  }

  const ayudaDetalle: Record<FormaDeCobro, string> = {
    transferencia: 'Banco y número de operación, si te lo mostró',
    efectivo: 'Cuándo lo traés al local',
    cheque: 'Banco, número y fecha de cobro de cada cheque',
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Nueva orden de recibo</h1>
        <button onClick={onCerrar} className={boton.suave}>
          Volver
        </button>
      </div>

      {clientes.data?.deLaCopia && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Sin señal: los clientes son los del {fechaHora(clientes.data.leidoEn)}.
        </p>
      )}

      {!cliente ? (
        <section className={`${tarjeta} space-y-3 p-4`}>
          <h2 className="text-sm font-semibold text-tinta">¿Quién pagó?</h2>
          <input
            autoFocus
            value={buscarCliente}
            onChange={(e) => setBuscarCliente(e.target.value)}
            placeholder="Nombre, localidad o ruta"
            className={campo}
          />
          {clientes.isPending ? (
            <p className="text-sm text-piedra-500">Cargando clientes…</p>
          ) : clientes.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {enCastellano(clientes.error, 'No se pudieron leer los clientes.')}
            </p>
          ) : encontrados.length === 0 ? (
            <p className="text-sm text-piedra-500">No hay clientes mayoristas con ese nombre.</p>
          ) : (
            <ul className="divide-y divide-piedra-100">
              {encontrados.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setClienteId(c.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2.5 text-left hover:bg-marca-50/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-tinta">{c.nombre}</span>
                      <span className="block truncate text-xs text-piedra-500">
                        {[c.localidad, c.ruta].filter(Boolean).join(' · ') || 'Sin localidad'}
                      </span>
                    </span>
                    {(c.saldo ?? 0) > 0 && (
                      <span className="text-xs tabular-nums text-piedra-600">debe {moneda.format(c.saldo!)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <section className={`${tarjeta} flex items-start justify-between gap-3 p-4`}>
            <div className="min-w-0">
              <p className="text-xs text-piedra-500">Cliente</p>
              <p className="truncate font-semibold text-tinta">{cliente.nombre}</p>
              <p className="truncate text-xs text-piedra-500">
                {[cliente.localidad, cliente.ruta].filter(Boolean).join(' · ')}
              </p>
              {cliente.saldo !== null && (
                <p className="text-sm tabular-nums text-piedra-700">debe {moneda.format(cliente.saldo)}</p>
              )}
            </div>
            <button onClick={() => setClienteId(null)} className={botonChico.suave}>
              Cambiar
            </button>
          </section>

          <section className={`${tarjeta} space-y-4 p-4`}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">¿Cuánto pagó?</span>
              <input
                inputMode="decimal"
                autoFocus
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500"
              />
            </label>

            <div>
              <span className="mb-1 block text-xs font-medium text-piedra-600">¿Cómo?</span>
              <div className="flex flex-wrap gap-1.5">
                {FORMAS_DE_COBRO.map((f) => (
                  <button
                    key={f.valor}
                    onClick={() => setForma(f.valor)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                      forma === f.valor
                        ? 'bg-marca-700 text-white ring-marca-700'
                        : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                    }`}
                  >
                    {f.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Detalle <span className="font-normal text-piedra-400">(opcional)</span>
              </span>
              <textarea
                rows={2}
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder={ayudaDetalle[forma]}
                className={campo}
              />
            </label>

            <p className="text-xs text-piedra-500">
              La deuda no baja hasta que el local confirme que entró la plata. Ahí sale el recibo.
            </p>

            <button
              onClick={alMandar}
              disabled={monto === null || enviando}
              className={`${boton.principal} w-full py-2.5`}
            >
              {enviando ? 'Mandando…' : monto ? `Mandar la orden por ${moneda.format(monto)}` : 'Mandar la orden'}
            </button>
          </section>
        </>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Una orden, y lo que el local hace con ella
// ───────────────────────────────────────────────────────────────

function FilaOrden({
  o,
  verVendedor,
  puedeResolver,
  onAviso,
  onError,
}: {
  o: OrdenRecibo
  verVendedor: boolean
  puedeResolver: boolean
  onAviso: (m: string) => void
  onError: (m: string) => void
}) {
  const { terminal } = useTerminal()
  const [aceptando, setAceptando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const caja = useQuery({
    queryKey: ['caja', terminal?.id],
    queryFn: () => cajaAbierta(terminal!.id),
    enabled: puedeResolver && !!terminal,
  })

  /*
    Con el recibo emitido, el mail sale solo si el cliente tiene uno
    cargado: es lo que pidió Lucas. Si el mail falla, el recibo ya está;
    se avisa y se puede mandar de nuevo desde el recibo.
  */
  async function alEmitir(r: ReciboEmitido) {
    setAceptando(false)
    const nro = numeroRecibo(r.serie, r.numero)
    if (!o.cliente_email) {
      onAviso(`Orden ${o.numero} aceptada: recibo ${nro}. ${o.cliente_nombre} no tiene mail cargado.`)
      return
    }
    setOcupado(true)
    try {
      await enviarReciboPorMail(await reciboCompleto(r.id), o.cliente_email)
      onAviso(`Orden ${o.numero} aceptada: recibo ${nro}, mandado por mail a ${o.cliente_email}.`)
    } catch (e) {
      onError(`Orden ${o.numero} aceptada: recibo ${nro}. El mail no salió: ${enCastellano(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function alRechazar() {
    const motivo = await pedirTexto({
      titulo: `Rechazar la orden ${o.numero}`,
      detalle: `La de ${o.cliente_nombre} por ${moneda.format(o.importe)}. La deuda no se toca; el vendedor ve el motivo.`,
      etiqueta: 'Motivo',
      ejemplo: 'No entró la transferencia',
      minimo: 3,
      aceptar: 'Rechazar',
      peligro: true,
    })
    if (!motivo) return
    setOcupado(true)
    try {
      await rechazarOrden(o.id, motivo)
      onAviso(`Orden ${o.numero}: rechazada.`)
    } catch (e) {
      onError(enCastellano(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <li className={`${tarjeta} space-y-2 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate font-medium text-tinta">{o.cliente_nombre}</p>
          <p className="text-xs text-piedra-500">
            Orden {o.numero} · {etiquetaForma(o.forma)} · {fechaHora(o.armado_en)}
            {verVendedor && o.vendedor_nombre && ` · ${o.vendedor_nombre}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-tinta">{moneda.format(o.importe)}</p>
          {o.cliente_saldo !== null && o.estado === 'pendiente' && (
            <p className="text-xs text-piedra-500">debe {moneda.format(o.cliente_saldo)}</p>
          )}
        </div>
      </div>

      {o.detalle && <p className="whitespace-pre-wrap break-words text-sm text-piedra-700">{o.detalle}</p>}

      {o.estado === 'aceptada' && o.recibo_id && (
        <p className="text-sm text-verde-800">
          Recibo{' '}
          <Link to={`/recibo/${o.recibo_id}`} className="font-medium underline">
            {o.recibo_numero}
          </Link>
          {o.resuelto_en && ` · ${fechaHora(o.resuelto_en)}`}
          {o.resuelto_por_nombre && ` · ${o.resuelto_por_nombre}`}
        </p>
      )}
      {o.estado === 'rechazada' && (
        <p className="text-sm text-red-700">
          Rechazada{o.resuelto_por_nombre && ` por ${o.resuelto_por_nombre}`}: {o.motivo_rechazo}
        </p>
      )}

      {puedeResolver && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => setAceptando(true)} disabled={ocupado} className={botonChico.principal}>
            Entró la plata: emitir el recibo
          </button>
          <button onClick={alRechazar} disabled={ocupado} className={botonChico.suave}>
            Rechazar
          </button>
        </div>
      )}

      {aceptando && (
        <ModalCobranza
          cliente={{ id: o.cliente_id, nombre: o.cliente_nombre }}
          saldo={o.cliente_saldo ?? 0}
          cajaId={caja.data?.id ?? null}
          inicial={{ importe: o.importe, forma: o.forma, ordenId: o.id, ordenNumero: o.numero, detalle: o.detalle }}
          onListo={alEmitir}
          onCancelar={() => setAceptando(false)}
        />
      )}
    </li>
  )
}
