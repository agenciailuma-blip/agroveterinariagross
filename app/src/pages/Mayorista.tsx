import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import { emitirEnServidor } from '@/lib/api/noFiscal'
import { enviarFacturaPorMail } from '@/lib/api/facturaPorMail'
import { obtenerComprobanteCompleto } from '@/lib/api/comprobante'
import { abrirComprobante, abrirNoFiscal } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { boton, botonChico, campo, tarjeta } from '@/estilos'
import {
  agregarLinea,
  buscarProductos,
  cambiarCantidad,
  cancelarPedido,
  cantidadesCorregidas,
  confirmarPedido,
  encolarPedido,
  enviarCola,
  ETIQUETA_ESTADO,
  facturarPedido,
  filtrarClientes,
  leerCatalogo,
  leerClientes,
  listarPedidos,
  pedidosEnCola,
  sacarDeLaCola,
  totalDe,
  type ClienteMayorista,
  type EstadoPedidoMayorista,
  type LineaArmada,
  type PedidoArmado,
  type PedidoMayorista,
  type VistaMayorista,
} from '@/lib/api/mayorista'

/*
  ─────────────────────────────────────────────────────────────
  Pedidos mayoristas

  Una sola pantalla para los dos lados, porque es el mismo pedido:

  · El vendedor de calle lo arma en el teléfono, parado frente al
    cliente, y lo manda. Ve los suyos y en qué quedaron.
  · El local lo recibe, el depósito corrobora que esté todo —y corrige
    lo que falte—, y se factura o sale con comprobante interno, a la
    cuenta corriente del cliente. Después, el remito.

  Lo que cada uno puede hacer lo deciden los permisos de su rol, que
  Lucas ajusta desde Usuarios.
  ─────────────────────────────────────────────────────────────
*/

const VISTAS: { valor: VistaMayorista; etiqueta: string }[] = [
  { valor: 'pendientes', etiqueta: 'En curso' },
  { valor: 'facturados', etiqueta: 'Facturados' },
  { valor: 'cancelados', etiqueta: 'Cancelados' },
]

const COLOR_ESTADO: Record<EstadoPedidoMayorista, string> = {
  pendiente: 'bg-marca-50 text-marca-700 ring-marca-200',
  confirmado: 'bg-acento-100 text-acento-600 ring-acento-300',
  facturado: 'bg-verde-50 text-verde-700 ring-verde-200',
  cancelado: 'bg-piedra-100 text-piedra-600 ring-borde',
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function fecha(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR')
}

/*
  La cola del teléfono, al día: lo que se armó y todavía no llegó. Sale
  sola apenas vuelve la señal, y al abrir la pantalla si hay señal.
*/
function useCola(alEnviar: (numeros: number[]) => void) {
  const [cola, setCola] = useState<PedidoArmado[]>(pedidosEnCola)

  useEffect(() => {
    const actualizar = () => setCola(pedidosEnCola())
    const mandar = () => {
      enviarCola()
        .then((r) => {
          if (r.enviados > 0) alEnviar(r.numeros)
        })
        .catch(() => {})
    }
    window.addEventListener('gross-mayorista-cola', actualizar)
    window.addEventListener('online', mandar)
    if (navigator.onLine && pedidosEnCola().length > 0) mandar()
    return () => {
      window.removeEventListener('gross-mayorista-cola', actualizar)
      window.removeEventListener('online', mandar)
    }
    // alEnviar cambia en cada dibujo y no hace falta volver a suscribirse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return cola
}

export default function Mayorista() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [vista, setVista] = useState<VistaMayorista>('pendientes')
  const [elegidoId, setElegidoId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const vende = tienePermiso('mayorista.vender')
  const atiende = tienePermiso('mayorista.atender')

  // Desde la lista de clientes se llega con el cliente ya elegido.
  const clienteParaArmar = params.get('cliente')
  const [armando, setArmando] = useState(vende && clienteParaArmar !== null)

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['mayorista-pedidos'] })
    qc.invalidateQueries({ queryKey: ['mayorista-pendientes'] })
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
    avisar(numeros.length === 1 ? `Llegó al local el pedido ${numeros[0]}.` : `Llegaron al local ${numeros.length} pedidos.`)
    refrescar()
  })

  const pedidos = useQuery({
    queryKey: ['mayorista-pedidos', vista],
    queryFn: () => listarPedidos(vista),
    enabled: vende || atiende,
    // El local se entera solo de lo que manda el vendedor.
    refetchInterval: atiende ? 60_000 : false,
  })

  if (!vende && !atiende) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para la venta mayorista.
      </p>
    )
  }

  if (armando) {
    return (
      <ArmarPedido
        clienteInicial={clienteParaArmar}
        onCerrar={() => {
          setArmando(false)
          if (clienteParaArmar) setParams({}, { replace: true })
        }}
        onListo={(m) => {
          setArmando(false)
          if (clienteParaArmar) setParams({}, { replace: true })
          avisar(m)
          refrescar()
        }}
      />
    )
  }

  const filas = pedidos.data ?? []
  const elegido = filas.find((p) => p.id === elegidoId) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Pedidos mayoristas</h1>
          <p className="text-sm text-piedra-500">
            {atiende
              ? 'Lo que mandó el vendedor de calle: corroborarlo, facturarlo y remitirlo.'
              : 'Los pedidos que armaste y en qué quedaron.'}
          </p>
        </div>
        {vende && (
          <button onClick={() => setArmando(true)} className={boton.principal}>
            Nuevo pedido
          </button>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {cola.length > 0 && <Cola cola={cola} onEnviados={(n) => { avisar(`Llegaron al local ${n} pedidos.`); refrescar() }} />}

      <div className="flex w-fit gap-1 rounded-lg bg-piedra-100 p-1">
        {VISTAS.map((v) => (
          <button
            key={v.valor}
            onClick={() => {
              setVista(v.valor)
              setElegidoId(null)
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              vista === v.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      <div className="flex gap-5">
        {/* En pantallas angostas la ficha reemplaza a la lista: al lado no entra. */}
        <section className={elegido ? 'hidden min-w-0 flex-1 lg:block' : 'min-w-0 flex-1'}>
          {pedidos.isPending ? (
            <p className="text-sm text-piedra-500">Cargando…</p>
          ) : pedidos.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {navigator.onLine
                ? enCastellano(pedidos.error, 'No se pudieron leer los pedidos.')
                : 'Sin señal no se ven los pedidos. Los que armes igual se guardan en el teléfono.'}
            </p>
          ) : filas.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
              <p className="text-center text-sm text-piedra-400">
                {vista === 'pendientes' ? 'No hay pedidos en curso.' : 'No hay pedidos acá.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filas.map((p) => (
                <FilaPedido
                  key={p.id}
                  p={p}
                  verVendedor={atiende}
                  activo={p.id === elegidoId}
                  onElegir={() => setElegidoId(p.id === elegidoId ? null : p.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {elegido && (
          <FichaPedido
            key={elegido.id}
            p={elegido}
            onCerrar={() => setElegidoId(null)}
            onAviso={(m) => {
              avisar(m)
              refrescar()
            }}
            onError={(m) => {
              fallar(m)
              refrescar()
            }}
          />
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Lo que quedó en el teléfono
// ───────────────────────────────────────────────────────────────

function Cola({ cola, onEnviados }: { cola: PedidoArmado[]; onEnviados: (n: number) => void }) {
  const mandar = useMutation({
    mutationFn: enviarCola,
    onSuccess: (r) => {
      if (r.enviados > 0) onEnviados(r.enviados)
    },
  })

  return (
    <section className="space-y-2 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-amber-900">
          {cola.length === 1 ? 'Un pedido' : `${cola.length} pedidos`} en el teléfono, sin llegar al local
        </p>
        <button onClick={() => mandar.mutate()} disabled={mandar.isPending} className={botonChico.principal}>
          {mandar.isPending ? 'Mandando…' : 'Mandar ahora'}
        </button>
      </div>
      <p className="text-xs text-amber-800">Salen solos cuando vuelve la señal.</p>
      <ul className="space-y-1.5">
        {cola.map((p) => (
          <li key={p.id} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 truncate font-medium text-tinta">{p.cliente_nombre}</span>
              <span className="tabular-nums text-piedra-600">{moneda.format(totalDe(p.lineas))}</span>
            </div>
            <p className="text-xs text-piedra-500">
              {p.lineas.length} {p.lineas.length === 1 ? 'producto' : 'productos'} · armado el {fechaHora(p.armado_en)}
            </p>
            {p.error && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-red-700">El local no lo aceptó: {p.error}</p>
                <button
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: 'Descartar este pedido',
                      detalle: `El de ${p.cliente_nombre}. No llegó al local; si lo descartás, hay que armarlo de nuevo.`,
                      aceptar: 'Descartar',
                      peligro: true,
                    })
                    if (ok) sacarDeLaCola(p.id)
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
// Armar un pedido, en el teléfono
// ───────────────────────────────────────────────────────────────

function ArmarPedido({
  clienteInicial,
  onCerrar,
  onListo,
}: {
  clienteInicial: string | null
  onCerrar: () => void
  onListo: (mensaje: string) => void
}) {
  const { tienePermiso } = useAuth()
  const cambiaPrecio = tienePermiso('mayorista.cambiar_precio')

  const catalogo = useQuery({ queryKey: ['mayorista-catalogo'], queryFn: leerCatalogo, staleTime: 5 * 60_000 })
  const clientes = useQuery({ queryKey: ['mayorista-clientes'], queryFn: leerClientes, staleTime: 5 * 60_000 })

  const [clienteId, setClienteId] = useState<string | null>(clienteInicial)
  const [buscarCliente, setBuscarCliente] = useState('')
  const [buscarProducto, setBuscarProducto] = useState('')
  const [lineas, setLineas] = useState<LineaArmada[]>([])
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cliente = clientes.data?.datos.find((c) => c.id === clienteId) ?? null
  const encontrados = useMemo(
    () => filtrarClientes(clientes.data?.datos ?? [], { texto: buscarCliente, ruta: '', soloConVencido: false }).slice(0, 40),
    [clientes.data, buscarCliente],
  )
  const productos = useMemo(
    () => (buscarProducto.trim() ? buscarProductos(catalogo.data?.datos ?? [], buscarProducto).slice(0, 30) : []),
    [catalogo.data, buscarProducto],
  )

  async function alMandar() {
    if (!cliente || lineas.length === 0) return
    setEnviando(true)
    const pedido: PedidoArmado = {
      id: crypto.randomUUID(),
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      lineas,
      observaciones: observaciones.trim(),
      armado_en: new Date().toISOString(),
    }
    // Primero en el teléfono: si la señal se corta a mitad de camino, no se pierde.
    encolarPedido(pedido)
    try {
      const r = await enviarCola()
      const enviado = !pedidosEnCola().some((p) => p.id === pedido.id)
      onListo(
        enviado
          ? `Pedido ${r.numeros[r.numeros.length - 1] ?? ''} de ${cliente.nombre}: llegó al local.`
          : `Sin señal: el pedido de ${cliente.nombre} quedó en el teléfono y sale solo cuando vuelva.`,
      )
    } catch {
      onListo(`El pedido de ${cliente.nombre} quedó en el teléfono: sale solo cuando vuelva la señal.`)
    } finally {
      setEnviando(false)
    }
  }

  const copia = catalogo.data?.deLaCopia || clientes.data?.deLaCopia

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Nuevo pedido</h1>
        <button onClick={onCerrar} className={boton.suave}>
          Volver
        </button>
      </div>

      {copia && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Sin señal: los precios y los clientes son los del{' '}
          {fechaHora((catalogo.data?.deLaCopia ? catalogo.data : clientes.data)!.leidoEn)}.
        </p>
      )}

      {/* ── El cliente ── */}
      {!cliente ? (
        <section className={`${tarjeta} space-y-3 p-4`}>
          <h2 className="text-sm font-semibold text-tinta">¿A quién?</h2>
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
            <p className="text-sm text-piedra-500">
              No hay clientes mayoristas con ese nombre. Se dan de alta en la pestaña Clientes.
            </p>
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
                    {(c.vencido ?? 0) > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Vencido {moneda.format(c.vencido!)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className={`${tarjeta} space-y-2 p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-piedra-500">Cliente</p>
              <p className="truncate font-semibold text-tinta">{cliente.nombre}</p>
              <p className="truncate text-xs text-piedra-500">
                {[cliente.localidad, cliente.ruta].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button onClick={() => setClienteId(null)} className={botonChico.suave}>
              Cambiar
            </button>
          </div>
          <AvisosDelCliente c={cliente} />
        </section>
      )}

      {/* ── Los productos ── */}
      {cliente && (
        <section className={`${tarjeta} space-y-3 p-4`}>
          <h2 className="text-sm font-semibold text-tinta">Productos</h2>
          <input
            value={buscarProducto}
            onChange={(e) => setBuscarProducto(e.target.value)}
            placeholder="Buscar por nombre o código"
            className={campo}
          />
          {catalogo.isError && (
            <p role="alert" className="text-sm text-red-700">
              {enCastellano(catalogo.error, 'No se pudo leer la lista mayorista.')}
            </p>
          )}
          {catalogo.data && catalogo.data.datos.length === 0 && (
            <p className="text-sm text-piedra-500">La lista mayorista todavía no tiene productos: se cargan en el local.</p>
          )}
          {productos.length > 0 && (
            <ul className="max-h-80 divide-y divide-piedra-100 overflow-y-auto rounded-lg ring-1 ring-borde">
              {productos.map((p) => (
                <li key={p.producto_id}>
                  <button
                    onClick={() => setLineas((l) => agregarLinea(l, p, 1))}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-marca-50/40"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-tinta">{p.nombre}</span>
                      <span className="block text-xs text-piedra-500">
                        <span className="font-mono">{p.codigo}</span>
                        {p.stock !== null && (
                          <span className={p.stock > 0 ? '' : 'text-red-700'}> · stock {numero.format(p.stock)}</span>
                        )}
                        {p.unidades_por_bulto ? ` · bulto de ${numero.format(p.unidades_por_bulto)}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular-nums text-tinta">{moneda.format(p.precio)}</span>
                      <span className="block text-xs text-marca-700">+ agregar</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lineas.length > 0 && (
            <ul className="space-y-2 border-t border-borde pt-3">
              {lineas.map((l) => (
                <LineaDelPedido
                  key={l.producto_id}
                  l={l}
                  cambiaPrecio={cambiaPrecio}
                  onCantidad={(c) => setLineas((ls) => cambiarCantidad(ls, l.producto_id, c))}
                  onPrecio={(precio) =>
                    setLineas((ls) => ls.map((x) => (x.producto_id === l.producto_id ? { ...x, precio } : x)))
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {cliente && lineas.length > 0 && (
        <section className={`${tarjeta} space-y-3 p-4`}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Para el local</span>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Cuándo lo necesita, cómo se lo llevan…"
              className={campo}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-piedra-600">
              Total <span className="text-lg font-semibold tabular-nums text-tinta">{moneda.format(totalDe(lineas))}</span>
            </p>
            <button onClick={alMandar} disabled={enviando} className={boton.principal}>
              {enviando ? 'Mandando…' : 'Mandar al local'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function AvisosDelCliente({ c }: { c: ClienteMayorista }) {
  const avisos: ReactNode[] = []
  if ((c.vencido ?? 0) > 0) {
    avisos.push(
      `Tiene ${moneda.format(c.vencido!)} vencido${c.vencimiento_mas_antiguo ? ` desde el ${fecha(c.vencimiento_mas_antiguo)}` : ''}.`,
    )
  }
  if (!c.cuenta_corriente) avisos.push('No tiene cuenta corriente: en el local hay que habilitarla para facturarle.')
  return (
    <>
      {c.saldo !== null && c.saldo > 0 && (
        <p className="text-xs text-piedra-600">Debe {moneda.format(c.saldo)} en total.</p>
      )}
      {avisos.map((a, i) => (
        <p key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {a}
        </p>
      ))}
    </>
  )
}

function LineaDelPedido({
  l,
  cambiaPrecio,
  onCantidad,
  onPrecio,
}: {
  l: LineaArmada
  cambiaPrecio: boolean
  onCantidad: (c: number) => void
  onPrecio: (p: number) => void
}) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-tinta">
          {l.nombre}
          <span className="block font-mono text-xs text-piedra-400">{l.codigo}</span>
        </p>
        <p className="shrink-0 text-sm font-medium tabular-nums text-tinta">
          {moneda.format(Math.round(l.cantidad * l.precio * 100) / 100)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg ring-1 ring-borde">
          <button
            onClick={() => onCantidad(l.cantidad - 1)}
            className="px-3 py-1.5 text-piedra-600 hover:bg-piedra-100"
            aria-label={`Uno menos de ${l.nombre}`}
          >
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={l.cantidad}
            onChange={(e) => onCantidad(Number(e.target.value))}
            className="w-16 border-x border-borde py-1.5 text-center text-sm tabular-nums outline-none"
            aria-label={`Cantidad de ${l.nombre}`}
          />
          <button
            onClick={() => onCantidad(l.cantidad + 1)}
            className="px-3 py-1.5 text-piedra-600 hover:bg-piedra-100"
            aria-label={`Uno más de ${l.nombre}`}
          >
            +
          </button>
        </div>
        <span className="text-xs text-piedra-500">×</span>
        {cambiaPrecio ? (
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={l.precio}
            onChange={(e) => onPrecio(Math.max(0, Number(e.target.value)))}
            className="w-28 rounded-lg border border-borde px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-marca-500"
            aria-label={`Precio de ${l.nombre}`}
          />
        ) : (
          <span className="text-sm tabular-nums text-piedra-600">{moneda.format(l.precio)}</span>
        )}
        {l.precio !== l.precio_lista && (
          <span className="text-xs text-amber-800">lista {moneda.format(l.precio_lista)}</span>
        )}
        <button onClick={() => onCantidad(0)} className={`${botonChico.suave} ml-auto`}>
          Sacar
        </button>
      </div>
    </li>
  )
}

// ───────────────────────────────────────────────────────────────
// La lista y la ficha
// ───────────────────────────────────────────────────────────────

function Estado({ estado }: { estado: EstadoPedidoMayorista }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR_ESTADO[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

function FilaPedido({
  p,
  verVendedor,
  activo,
  onElegir,
}: {
  p: PedidoMayorista
  verVendedor: boolean
  activo: boolean
  onElegir: () => void
}) {
  const faltan = p.lineas.some((l) => l.stock !== null && l.stock < l.cantidad)
  return (
    <li>
      <button
        onClick={onElegir}
        className={`${tarjeta} flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-marca-50/40 ${
          activo ? 'ring-2 ring-marca-500' : ''
        }`}
      >
        <span className="font-mono text-xs text-piedra-500">N.º {p.numero}</span>
        <span className="order-first w-full min-w-0 truncate font-medium text-tinta sm:order-none sm:w-auto sm:flex-1">
          {p.cliente_nombre}
        </span>
        <span className="text-xs text-piedra-500">
          {[p.cliente_localidad, p.cliente_ruta].filter(Boolean).join(' · ') || '—'}
        </span>
        {verVendedor && p.vendedor_nombre && <span className="text-xs text-piedra-500">{p.vendedor_nombre}</span>}
        <span className="font-medium tabular-nums text-tinta">{moneda.format(p.total)}</span>
        <Estado estado={p.estado} />
        {faltan && p.estado !== 'facturado' && p.estado !== 'cancelado' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Falta stock</span>
        )}
      </button>
    </li>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-piedra-500">{etiqueta}</dt>
      <dd className="break-words text-sm text-tinta">{children}</dd>
    </div>
  )
}

function FichaPedido({
  p,
  onCerrar,
  onAviso,
  onError,
}: {
  p: PedidoMayorista
  onCerrar: () => void
  onAviso: (m: string) => void
  onError: (m: string) => void
}) {
  const { tienePermiso } = useAuth()
  const { terminal } = useTerminal()
  const atiende = tienePermiso('mayorista.atender')
  const enCurso = p.estado === 'pendiente' || p.estado === 'confirmado'
  const corrige = atiende && enCurso
  const [cantidades, setCantidades] = useState<Record<string, number>>({})

  const cambios = cantidadesCorregidas(p.lineas, cantidades)
  const lineas = p.lineas.map((l) => ({ ...l, cantidad: cantidades[l.producto_id] ?? l.cantidad }))
  const total = totalDe(lineas)

  const puedeFacturar = atiende && tienePermiso('facturacion.emitir')
  const puedeSinFactura = atiende && tienePermiso('facturacion.vender_sin_factura')
  const puedeRemitir = tienePermiso('facturacion.no_fiscal_emitir')
  const puedeCancelar = enCurso && (atiende || p.estado === 'pendiente')

  // Una acción por vez: dos toques seguidos no facturan dos veces.
  const accion = useMutation({
    mutationFn: async (hacer: () => Promise<string | null>) => hacer(),
    onSuccess: (m) => {
      if (m) onAviso(m)
    },
    onError: (e) => onError(enCastellano(e)),
  })
  const ocupado = accion.isPending

  function alConfirmar() {
    accion.mutate(async () => {
      await confirmarPedido(p.id, cambios)
      setCantidades({})
      return p.estado === 'pendiente'
        ? `Pedido ${p.numero}: corroborado, listo para facturar.`
        : `Pedido ${p.numero}: cantidades corregidas.`
    })
  }

  async function alFacturar(documentacion: 'fiscal' | 'no_fiscal') {
    const ok = await confirmar({
      titulo: documentacion === 'fiscal' ? `Facturar el pedido ${p.numero}` : `Pedido ${p.numero} sin factura`,
      detalle: `${moneda.format(p.total)} a la cuenta corriente de ${p.cliente_nombre}.`,
      aceptar: documentacion === 'fiscal' ? 'Facturar' : 'Emitir el comprobante interno',
    })
    if (!ok) return

    accion.mutate(async () => {
      const r = await facturarPedido(p.id, documentacion)

      if (documentacion === 'no_fiscal') {
        const interno = await emitirEnServidor(r.ventaId, 'comprobante_interno', terminal?.id ?? null, {
          serie: terminal?.prefijo ?? null,
          observaciones: `Pedido mayorista ${p.numero}`,
        })
        abrirNoFiscal(interno.id)
        return `Pedido ${p.numero}: a la cuenta corriente, con comprobante interno.`
      }

      if (r.problema) {
        // La factura ya existe con su número: lo que falta es el CAE.
        onError(
          `El pedido quedó facturado pero ARCA no autorizó la factura: ${r.problema}. Se reintenta desde Facturación.`,
        )
        return null
      }
      // La factura le llega sola al cliente. Si el mail no sale, se manda desde la factura.
      let mail = ''
      if (p.cliente_email) {
        try {
          await enviarFacturaPorMail(await obtenerComprobanteCompleto(r.comprobanteId!), p.cliente_email, true)
          mail = ` Se la mandamos por mail a ${p.cliente_email}.`
        } catch (e) {
          mail = ` El mail no salió: ${enCastellano(e)} Se manda desde la factura.`
        }
      }
      abrirComprobante(r.comprobanteId!)
      return `Pedido ${p.numero}: facturado.${mail}`
    })
  }

  async function alRemitir() {
    const destino = [p.cliente_domicilio, p.cliente_localidad].filter(Boolean).join(', ') || 'sin domicilio cargado'
    const ok = await confirmar({
      titulo: `Remito del pedido ${p.numero}`,
      detalle: `Para ${p.cliente_nombre}, a ${destino}.`,
      aceptar: 'Emitir el remito',
    })
    if (!ok || !p.venta_id) return
    accion.mutate(async () => {
      const r = await emitirEnServidor(p.venta_id!, 'remito', terminal?.id ?? null, {
        serie: terminal?.prefijo ?? null,
        observaciones: `Pedido mayorista ${p.numero}`,
        entrega: { domicilio: p.cliente_domicilio, localidad: p.cliente_localidad, contacto: p.cliente_telefono },
      })
      abrirNoFiscal(r.id)
      return `Pedido ${p.numero}: remito emitido.`
    })
  }

  async function alCancelar() {
    const motivo = await pedirTexto({
      titulo: `Cancelar el pedido ${p.numero}`,
      detalle: `El de ${p.cliente_nombre}. No se factura ni se le carga nada.`,
      etiqueta: 'Motivo',
      ejemplo: 'Se equivocó de cliente',
      minimo: 3,
      aceptar: 'Cancelar el pedido',
      peligro: true,
    })
    if (!motivo) return
    accion.mutate(async () => {
      await cancelarPedido(p.id, motivo)
      return `Pedido ${p.numero}: cancelado.`
    })
  }

  return (
    <aside className={`${tarjeta} w-full min-w-0 shrink-0 space-y-4 self-start p-4 sm:p-5 lg:w-[30rem]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-piedra-500">
            Pedido N.º {p.numero}
            {p.venta_codigo ? ` · venta ${p.venta_codigo}` : ''}
          </p>
          <h2 className="truncate text-lg font-semibold text-tinta">{p.cliente_nombre}</h2>
          <p className="text-xs text-piedra-500">
            Armado el {fechaHora(p.armado_en)}
            {p.vendedor_nombre ? ` por ${p.vendedor_nombre}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Estado estado={p.estado} />
          <button onClick={onCerrar} className={botonChico.suave} aria-label="Cerrar el pedido">
            Cerrar
          </button>
        </div>
      </div>

      {p.estado === 'cancelado' && (
        <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-600 ring-1 ring-borde">
          Cancelado{p.cancelado_en ? ` el ${fechaHora(p.cancelado_en)}` : ''}
          {p.motivo_cancelacion ? `: ${p.motivo_cancelacion}` : ''}
        </p>
      )}

      {p.observaciones && (
        <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-700">{p.observaciones}</p>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Dato etiqueta="Domicilio">
          {[p.cliente_domicilio, p.cliente_localidad].filter(Boolean).join(', ') || '—'}
        </Dato>
        <Dato etiqueta="Teléfono">{p.cliente_telefono ?? '—'}</Dato>
        {p.confirmado_en && (
          <Dato etiqueta="Corroborado">
            {fechaHora(p.confirmado_en)}
            {p.confirmado_por_nombre ? ` · ${p.confirmado_por_nombre}` : ''}
          </Dato>
        )}
        {p.comprobante_id && (
          <Dato etiqueta="Factura">
            <button onClick={() => abrirComprobante(p.comprobante_id!)} className="text-marca-700 underline">
              {p.comprobante_numero}
            </button>
            {!p.comprobante_cae && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">esperando el CAE</span>
            )}
          </Dato>
        )}
        {p.interno_id && (
          <Dato etiqueta="Comprobante interno">
            <button onClick={() => abrirNoFiscal(p.interno_id!)} className="text-marca-700 underline">
              {p.interno_numero}
            </button>
          </Dato>
        )}
        {p.remito_id && (
          <Dato etiqueta="Remito">
            <button onClick={() => abrirNoFiscal(p.remito_id!)} className="text-marca-700 underline">
              {p.remito_numero}
            </button>
          </Dato>
        )}
      </dl>

      <div>
        {corrige && p.estado === 'pendiente' && (
          <p className="mb-2 text-xs text-piedra-500">
            Si falta algo, corregí la cantidad antes de corroborar. En cero sale del pedido.
          </p>
        )}
        <ul className="divide-y divide-piedra-100 border-y border-borde">
          {lineas.map((l) => {
            const falta = l.stock !== null && l.stock < l.cantidad
            return (
              <li key={l.producto_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm text-tinta">{l.nombre}</p>
                  <p className="text-xs text-piedra-500">
                    <span className="font-mono">{l.codigo}</span> · {moneda.format(l.precio)}
                    {l.precio !== l.precio_lista && (
                      <span className="text-amber-800"> (lista {moneda.format(l.precio_lista)})</span>
                    )}
                    {l.stock !== null && enCurso && (
                      <span className={falta ? 'font-medium text-red-700' : ''}> · stock {numero.format(l.stock)}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {corrige ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={l.cantidad}
                      onChange={(e) =>
                        setCantidades((c) => ({ ...c, [l.producto_id]: Math.max(0, Number(e.target.value)) }))
                      }
                      className="w-20 rounded-lg border border-borde px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-marca-500"
                      aria-label={`Cantidad de ${l.nombre}`}
                    />
                  ) : (
                    <span className="text-sm tabular-nums text-piedra-600">× {numero.format(l.cantidad)}</span>
                  )}
                  <span className="w-24 text-right text-sm font-medium tabular-nums text-tinta">
                    {moneda.format(Math.round(l.cantidad * l.precio * 100) / 100)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 flex justify-between text-sm font-medium text-tinta">
          <span>Total</span>
          <span className="tabular-nums">{moneda.format(total)}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {corrige && (p.estado === 'pendiente' || cambios.length > 0) && (
          <button onClick={alConfirmar} disabled={ocupado} className={p.estado === 'pendiente' ? boton.principal : boton.secundario}>
            {p.estado === 'pendiente' ? 'Está todo: corroborado' : 'Guardar las cantidades'}
          </button>
        )}
        {p.estado === 'confirmado' && cambios.length === 0 && puedeFacturar && (
          <button onClick={() => alFacturar('fiscal')} disabled={ocupado} className={boton.principal}>
            Facturar
          </button>
        )}
        {p.estado === 'confirmado' && cambios.length === 0 && puedeSinFactura && (
          <button onClick={() => alFacturar('no_fiscal')} disabled={ocupado} className={boton.secundario}>
            Sin factura
          </button>
        )}
        {p.estado === 'facturado' && !p.remito_id && puedeRemitir && (
          <button onClick={alRemitir} disabled={ocupado} className={boton.secundario}>
            Remito
          </button>
        )}
        {puedeCancelar && (
          <button onClick={alCancelar} disabled={ocupado} className={boton.suave}>
            Cancelar el pedido
          </button>
        )}
      </div>
      {ocupado && <p className="text-xs text-piedra-500">Un momento…</p>}
    </aside>
  )
}
