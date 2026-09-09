import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { emitirNoFiscal, emitirRemitoDirecto, ventasParaRemitir } from '@/lib/api/noFiscal'
import type { LineaRemito, VentaParaRemitir } from '@/lib/api/noFiscal'
import { buscarClientes, buscarProductosVenta } from '@/lib/api/ventas'
import type { ClienteVenta, ProductoVenta } from '@/lib/api/ventas'
import { moneda, numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Armar un remito

  Dos orígenes, y la diferencia es de fondo:

  · DESDE UNA VENTA — el reparto de todos los días. Las líneas ya
    están calculadas por el sistema y no se vuelven a escribir.

  · DE CERO — lo que pidió Lucas el 07/09. No hay venta todavía: es
    mercadería que se pide especialmente para un cliente, muchas
    veces la municipalidad, y que ni siquiera entró al local.

  Ese segundo caso es el que trae las otras dos novedades, y las tres
  van juntas porque sin las otras dos no sirve:

  1. Se puede elegir que NO descuente stock. Un remito de mercadería
     que todavía no está no puede descontar: descontaría algo que no
     hay.

  2. Se puede escribir una LÍNEA LIBRE: un renglón que no existe en
     el catálogo y que no se crea. Es el "producto comodín" — lo muy
     particular, que se vende por pedido a un cliente y una vez.

  El límite, escrito una vez: una línea libre no reemplaza al
  catálogo. No mueve stock, no entra al inventario y no tiene costo.
  Si algo se vende dos veces, va al catálogo.
  ─────────────────────────────────────────────────────────────
*/

type Origen = 'venta' | 'cero'

interface Props {
  terminalId: string | null
  terminalPrefijo: string | null
  onCerrar: () => void
  onEmitido: (id: string) => void
  onError: (m: string) => void
}

export default function NuevoRemito({
  terminalId,
  terminalPrefijo,
  onCerrar,
  onEmitido,
  onError,
}: Props) {
  const [origen, setOrigen] = useState<Origen>('venta')

  // ── Comunes a los dos orígenes
  const [domicilio, setDomicilio] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [contacto, setContacto] = useState('')
  const [transportista, setTransportista] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [descuenta, setDescuenta] = useState(true)

  // ── Desde una venta
  const [busqueda, setBusqueda] = useState('')
  const [elegida, setElegida] = useState<VentaParaRemitir | null>(null)

  // ── De cero
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  const [lineas, setLineas] = useState<LineaRemito[]>([])

  const ventas = useQuery({
    queryKey: ['ventas-para-remitir', busqueda],
    queryFn: () => ventasParaRemitir(busqueda),
    enabled: origen === 'venta',
  })

  function elegirVenta(v: VentaParaRemitir) {
    setElegida(v)
    setDomicilio(v.cliente_domicilio ?? '')
    setLocalidad(v.cliente_localidad ?? '')
    setContacto(v.cliente_telefono ?? '')
  }

  const emitir = useMutation({
    mutationFn: async () => {
      if (origen === 'venta') {
        return (
          await emitirNoFiscal(elegida!.id, 'remito', terminalId, {
            serie: terminalPrefijo,
            observaciones: observaciones.trim() || null,
            descuentaStock: descuenta,
            entrega: {
              domicilio: domicilio.trim() || null,
              localidad: localidad.trim() || null,
              contacto: contacto.trim() || null,
              transportista: transportista.trim() || null,
            },
          })
        ).id
      }
      return (
        await emitirRemitoDirecto(cliente!.id, lineas, {
          descuentaStock: descuenta,
          terminalId,
          serie: terminalPrefijo,
          observaciones: observaciones.trim() || null,
          entrega: {
            domicilio: domicilio.trim() || null,
            localidad: localidad.trim() || null,
            contacto: contacto.trim() || null,
            transportista: transportista.trim() || null,
          },
        })
      ).id
    },
    onSuccess: onEmitido,
    onError: (e) => onError(e instanceof Error ? e.message : 'No se pudo emitir el remito.'),
  })

  const listo = origen === 'venta' ? !!elegida : !!cliente && lineas.length > 0
  /*
    El remito desde una venta sólo descuenta si la venta todavía no lo
    hizo. Cuando ya está cobrada no hay nada que decidir: el stock ya
    salió. Ofrecer la casilla ahí sería ofrecer una decisión que no
    existe, y que quien la apague crea que hizo algo.
  */
  const puedeElegirStock = origen === 'cero' || (!!elegida && elegida.estado !== 'cobrada')

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-tinta">Nuevo remito</h2>

        <div className="mt-3 flex gap-1 rounded-lg bg-piedra-100 p-1">
          {(
            [
              ['venta', 'Desde una venta'],
              ['cero', 'De cero'],
            ] as const
          ).map(([o, texto]) => (
            <button
              key={o}
              onClick={() => {
                setOrigen(o)
                setElegida(null)
                setCliente(null)
                setLineas([])
                setDescuenta(true)
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                origen === o ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        {origen === 'venta' ? (
          !elegida ? (
            <>
              <p className="mt-3 text-sm text-piedra-500">¿De qué venta sale la mercadería?</p>
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código de venta…"
                className={claseInput + ' mt-3'}
              />
              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg ring-1 ring-borde">
                {ventas.isPending ? (
                  <p className="p-4 text-sm text-piedra-500">Buscando…</p>
                ) : (ventas.data?.length ?? 0) === 0 ? (
                  <p className="p-4 text-sm text-piedra-500">
                    No hay ventas sin remito para mostrar.
                  </p>
                ) : (
                  <ul>
                    {ventas.data!.map((v) => (
                      <li key={v.id} className="border-b border-piedra-100 last:border-0">
                        <button
                          onClick={() => elegirVenta(v)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-piedra-50"
                        >
                          <span className="font-medium tabular-nums text-tinta">{v.codigo}</span>
                          <span className="min-w-0 flex-1 truncate text-piedra-600">
                            {v.cliente_nombre}
                          </span>
                          {v.estado !== 'cobrada' && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                              sin cobrar
                            </span>
                          )}
                          <span className="tabular-nums text-piedra-600">
                            {moneda.format(v.total)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-piedra-50 px-3 py-2 text-sm ring-1 ring-borde">
              <div className="min-w-0">
                <p className="font-medium text-tinta">
                  {elegida.codigo} · {elegida.cliente_nombre}
                </p>
                <p className="text-xs text-piedra-500">
                  {moneda.format(elegida.total)}
                  {elegida.estado !== 'cobrada' && ' · todavía sin cobrar'}
                </p>
              </div>
              <button
                onClick={() => setElegida(null)}
                className="shrink-0 text-xs text-marca-700 underline"
              >
                Cambiar
              </button>
            </div>
          )
        ) : (
          <DeCero
            cliente={cliente}
            onCliente={(c) => {
              setCliente(c)
              setLocalidad((l) => l)
            }}
            lineas={lineas}
            onLineas={setLineas}
          />
        )}

        {/* ── Si descuenta stock o no ── */}
        {listo && (
          <div
            className={`mt-4 rounded-lg p-3 ring-1 ${
              descuenta ? 'bg-amber-50 ring-amber-200' : 'bg-piedra-50 ring-borde'
            }`}
          >
            {puedeElegirStock ? (
              <>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={descuenta}
                    onChange={(e) => setDescuenta(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-borde accent-marca-700"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-tinta">
                      Esta mercadería sale del local ahora
                    </span>
                    <span className="mt-0.5 block text-xs text-piedra-600">
                      Descuenta el stock. Cuando se cobre, la caja reconcilia: si vuelve mercadería
                      sin entregar, alcanza con corregir la venta.
                    </span>
                  </span>
                </label>
                {!descuenta && (
                  <p className="mt-2 border-t border-borde pt-2 text-xs text-piedra-600">
                    <strong className="text-tinta">No descuenta stock.</strong> Es el remito de
                    mercadería que todavía no entró al local — la que se pide especialmente para
                    este cliente. Documenta el compromiso y no toca el inventario.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-piedra-600">
                Esta venta ya está cobrada, así que el stock ya salió. Este remito documenta el
                traslado y no vuelve a descontar.
              </p>
            )}
          </div>
        )}

        {listo && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Domicilio de entrega" valor={domicilio} alCambiar={setDomicilio} />
              <Campo etiqueta="Localidad" valor={localidad} alCambiar={setLocalidad} />
              <Campo etiqueta="Contacto" valor={contacto} alCambiar={setContacto} />
              <Campo
                etiqueta="Transporte / quién lleva"
                valor={transportista}
                alCambiar={setTransportista}
              />
            </div>
            <Campo
              etiqueta="Observaciones"
              valor={observaciones}
              alCambiar={setObservaciones}
              className="mt-3"
            />
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => emitir.mutate()}
            disabled={!listo || emitir.isPending}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {emitir.isPending ? 'Emitiendo…' : 'Emitir e imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   El remito escrito a mano: cliente y líneas
   ───────────────────────────────────────────────────────────── */
function DeCero({
  cliente,
  onCliente,
  lineas,
  onLineas,
}: {
  cliente: ClienteVenta | null
  onCliente: (c: ClienteVenta | null) => void
  lineas: LineaRemito[]
  onLineas: (l: LineaRemito[]) => void
}) {
  const [textoCliente, setTextoCliente] = useState('')
  const [textoProducto, setTextoProducto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [libre, setLibre] = useState({ descripcion: '', cantidad: '1' })
  const campoProducto = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(textoProducto.trim()), 200)
    return () => clearTimeout(t)
  }, [textoProducto])

  const clientes = useQuery({
    queryKey: ['remito-clientes', textoCliente],
    queryFn: () => buscarClientes(textoCliente),
    enabled: !cliente,
  })

  const productos = useQuery({
    queryKey: ['remito-productos', debounced],
    queryFn: () => buscarProductosVenta(debounced),
    enabled: !!cliente && debounced.length >= 2,
  })

  function agregarProducto(p: ProductoVenta) {
    const ya = lineas.find((l) => l.producto_id === p.producto_id)
    if (ya) {
      onLineas(
        lineas.map((l) =>
          l.producto_id === p.producto_id ? { ...l, cantidad: l.cantidad + 1 } : l,
        ),
      )
    } else {
      onLineas([
        ...lineas,
        {
          producto_id: p.producto_id,
          codigo: p.codigo,
          descripcion: p.nombre_interno,
          cantidad: 1,
          precio_unitario: p.precio_venta,
        },
      ])
    }
    setTextoProducto('')
    campoProducto.current?.focus()
  }

  function agregarLibre() {
    const desc = libre.descripcion.trim()
    const cant = Number(libre.cantidad)
    if (!desc || !(cant > 0)) return
    onLineas([
      ...lineas,
      {
        // Sin producto: es lo único que distingue una línea libre, acá y
        // en la base. Es también lo que hace que no mueva stock.
        producto_id: null,
        codigo: 'LIBRE',
        descripcion: desc,
        cantidad: cant,
        // Sin precio: el remito no los imprime, y una línea que no está
        // en el catálogo tampoco tiene precio de lista que copiar.
        precio_unitario: 0,
      },
    ])
    setLibre({ descripcion: '', cantidad: '1' })
  }

  if (!cliente) {
    return (
      <>
        <p className="mt-3 text-sm text-piedra-500">¿Para quién es el remito?</p>
        <input
          autoFocus
          value={textoCliente}
          onChange={(e) => setTextoCliente(e.target.value)}
          placeholder="Buscar cliente por nombre, CUIT o código…"
          className={claseInput + ' mt-3'}
        />
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg ring-1 ring-borde">
          {clientes.isPending ? (
            <p className="p-4 text-sm text-piedra-500">Buscando…</p>
          ) : (clientes.data?.length ?? 0) === 0 ? (
            <p className="p-4 text-sm text-piedra-500">No se encontró ningún cliente.</p>
          ) : (
            <ul>
              {clientes.data!.map((c) => (
                <li key={c.id} className="border-b border-piedra-100 last:border-0">
                  <button
                    onClick={() => onCliente(c)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-piedra-50"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-tinta">
                      {c.nombre}
                    </span>
                    {c.numero_documento && (
                      <span className="tabular-nums text-xs text-piedra-500">
                        {c.numero_documento}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-piedra-50 px-3 py-2 text-sm ring-1 ring-borde">
        <p className="min-w-0 truncate font-medium text-tinta">{cliente.nombre}</p>
        <button
          onClick={() => onCliente(null)}
          className="shrink-0 text-xs text-marca-700 underline"
        >
          Cambiar
        </button>
      </div>

      {/* ── Del catálogo ── */}
      <div>
        <input
          ref={campoProducto}
          autoFocus
          value={textoProducto}
          onChange={(e) => setTextoProducto(e.target.value)}
          placeholder="Buscar un producto del catálogo…"
          className={claseInput}
        />
        {(productos.data?.length ?? 0) > 0 && (
          <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg ring-1 ring-borde">
            {productos.data!.map((p) => (
              <li key={p.producto_id} className="border-b border-piedra-100 last:border-0">
                <button
                  onClick={() => agregarProducto(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-piedra-50"
                >
                  <span className="min-w-0 flex-1 truncate text-tinta">{p.nombre_interno}</span>
                  <span className="shrink-0 text-xs text-piedra-400">
                    quedan {numero.format(p.cantidad)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Escrita a mano ── */}
      <div className="rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
        <p className="text-xs font-medium text-piedra-600">
          ¿No está en el catálogo? Escribilo
        </p>
        <p className="mt-0.5 text-xs text-piedra-500">
          Para lo que se pide especialmente y se vende una sola vez. No se crea en el catálogo y no
          mueve stock.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={libre.descripcion}
            onChange={(e) => setLibre({ ...libre, descripcion: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                agregarLibre()
              }
            }}
            placeholder="Comedero de acero inoxidable 40 cm"
            className={`${sinAncho} min-w-0 flex-1`}
          />
          <input
            type="number"
            min="0"
            step="1"
            value={libre.cantidad}
            onChange={(e) => setLibre({ ...libre, cantidad: e.target.value })}
            className={`${sinAncho} w-20 shrink-0 text-right tabular-nums`}
          />
          <button
            onClick={agregarLibre}
            disabled={!libre.descripcion.trim()}
            className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-piedra-50 disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>

      {/* ── Lo que va a salir ── */}
      {lineas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borde px-3 py-6 text-center text-sm text-piedra-400">
          El remito todavía no tiene nada.
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-b border-piedra-100 last:border-0">
                <td className="py-1.5">
                  <p className="text-tinta">{l.descripcion}</p>
                  <p className="font-mono text-xs text-piedra-400">
                    {l.producto_id ? l.codigo : 'escrito a mano · no mueve stock'}
                  </p>
                </td>
                <td className="w-24 py-1.5">
                  <input
                    type="number"
                    min="0"
                    step={l.producto_id ? 1 : 1}
                    value={l.cantidad}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (n <= 0) return onLineas(lineas.filter((_, j) => j !== i))
                      onLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: n } : x)))
                    }}
                    className={claseInput + ' text-center tabular-nums'}
                  />
                </td>
                <td className="w-8 py-1.5 text-right">
                  <button
                    onClick={() => onLineas(lineas.filter((_, j) => j !== i))}
                    className="rounded p-1 text-piedra-300 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Quitar ${l.descripcion}`}
                  >
                    <svg
                      className="size-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/*
  El ancho va aparte porque adentro de un flex lo decide el contenedor.
  Dos `w-full` hermanos se pelean y el resultado es un campo enorme al
  lado de un cuadradito.
*/
const sinAncho =
  'rounded-lg border border-borde px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500'
const claseInput = `w-full ${sinAncho}`

function Campo({
  etiqueta,
  valor,
  alCambiar,
  className = '',
}: {
  etiqueta: string
  valor: string
  alCambiar: (v: string) => void
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-piedra-600">{etiqueta}</span>
      <input value={valor} onChange={(e) => alCambiar(e.target.value)} className={claseInput + ' mt-1'} />
    </label>
  )
}
