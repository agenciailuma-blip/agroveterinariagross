import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import { IdentificarOperador, useOperador } from '@/components/IdentificarOperador'
import {
  buscarClientes,
  buscarProductosVenta,
  clienteConsumidorFinal,
  enviarACaja,
  esFraccionable,
  pasoCantidad,
} from '@/lib/api/ventas'
import type { ClienteVenta, LineaVenta, ProductoVenta } from '@/lib/api/ventas'
import { cargarPrecios, previsualizarPrecio } from '@/lib/api/precios'
import type { MedioPago } from '@/lib/api/precios'
import { moneda, numero } from '@/lib/tipos'

const BORRADOR = 'gross.venta-en-curso'

export default function PuntoDeVenta() {
  const { terminal, disponibles, cargando: cargandoTerminal, elegir } = useTerminal()
  const { operador, identificar, salir, renovar } = useOperador()

  const [lineas, setLineas] = useState<LineaVenta[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(BORRADOR) ?? '[]') as LineaVenta[]
    } catch {
      return []
    }
  })
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [textoCliente, setTextoCliente] = useState('')
  const [medioAnticipado, setMedioAnticipado] = useState<string | null>(null)
  const [cuotasAnticipadas, setCuotasAnticipadas] = useState(1)
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const busqueda = useRef<HTMLInputElement>(null)

  // El borrador sobrevive a un refresco accidental. Una venta a medio
  // armar que se pierde por un F5 es media hora de mostrador tirada.
  useEffect(() => {
    localStorage.setItem(BORRADOR, JSON.stringify(lineas))
  }, [lineas])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 200)
    return () => clearTimeout(t)
  }, [texto])

  useEffect(() => {
    if (!cliente) clienteConsumidorFinal().then((c) => c && setCliente(c))
  }, [cliente])

  const resultados = useQuery({
    queryKey: ['venta-buscar', debounced],
    queryFn: () => buscarProductosVenta(debounced),
    enabled: debounced.length >= 2,
  })

  const clientes = useQuery({
    queryKey: ['venta-clientes', textoCliente],
    queryFn: () => buscarClientes(textoCliente),
    enabled: buscandoCliente,
  })

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios, staleTime: 300_000 })

  const listaTarjeta = precios.data?.listas.find((l) => !l.es_predeterminada)
  const medios = precios.data?.medios ?? []
  const medio = medios.find((m) => m.id === medioAnticipado)
  const listaElegida = medio
    ? precios.data?.listas.find((l) => l.id === medio.lista_precio_id)
    : undefined
  const recargoElegido =
    medio?.medio_pago_cuota.find((c) => c.cuotas === cuotasAnticipadas)?.recargo_porcentaje ?? 0

  const totales = useMemo(() => {
    const bruto = lineas.reduce((s, l) => s + l.cantidad * l.precio_original, 0)
    const neto = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)
    const descuentoCliente = cliente?.descuento_porcentaje ?? 0
    const conDescuento = neto * (1 - descuentoCliente / 100)
    return {
      bruto,
      descuentoLineas: bruto - neto,
      descuentoCliente: neto - conDescuento,
      contado: Math.round(conDescuento * 100) / 100,
      conTarjeta: previsualizarPrecio(conDescuento, listaTarjeta, 0),
      elegido: previsualizarPrecio(conDescuento, listaElegida, recargoElegido),
      unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    }
  }, [lineas, cliente, listaTarjeta, listaElegida, recargoElegido])

  function agregar(p: ProductoVenta) {
    renovar()
    setError(null)
    setLineas((prev) => {
      const existente = prev.find((l) => l.producto_id === p.producto_id)
      if (existente) {
        return prev.map((l) =>
          l.producto_id === p.producto_id ? { ...l, cantidad: l.cantidad + 1 } : l,
        )
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          producto_id: p.producto_id,
          codigo_producto: p.codigo,
          descripcion: p.nombre_interno,
          unidad_medida: p.unidad_medida,
          cantidad: 1,
          precio_original: p.precio_venta,
          precio_unitario: p.precio_venta,
          motivo_modificacion: null,
          alicuota_iva_id: p.alicuota_iva_id,
          condicion_iva: p.condicion_iva,
          stock_disponible: p.cantidad,
        },
      ]
    })
    setTexto('')
    busqueda.current?.focus()
  }

  function cambiarCantidad(id: string, cantidad: number) {
    renovar()
    if (cantidad <= 0) return setLineas((p) => p.filter((l) => l.id !== id))
    setLineas((p) =>
      p.map((l) =>
        l.id === id
          ? {
              ...l,
              // Un collar o un frasco no se venden por mitades. Se
              // redondea acá y no sólo con el paso del campo, porque
              // tipear a mano también tiene que respetarlo.
              cantidad: esFraccionable(l.unidad_medida) ? cantidad : Math.round(cantidad),
            }
          : l,
      ),
    )
  }

  function cambiarPrecio(id: string) {
    const linea = lineas.find((l) => l.id === id)
    if (!linea) return
    const nuevo = window.prompt(
      `Precio de ${linea.descripcion}\nDe lista: ${moneda.format(linea.precio_original)}`,
      String(linea.precio_unitario),
    )
    if (nuevo === null) return
    const valor = Number(nuevo)
    if (!Number.isFinite(valor) || valor < 0) return setError('El precio no es válido.')

    if (valor === linea.precio_original) {
      return setLineas((p) =>
        p.map((l) => (l.id === id ? { ...l, precio_unitario: valor, motivo_modificacion: null } : l)),
      )
    }

    // La base rechaza una línea con precio cambiado sin motivo. Se pide
    // acá para que el error no aparezca recién al enviar a caja.
    const motivo = window.prompt('¿Por qué se modifica el precio?')
    if (!motivo || motivo.trim().length < 3) {
      return setError('Para cambiar el precio hay que indicar el motivo.')
    }
    setError(null)
    setLineas((p) =>
      p.map((l) =>
        l.id === id ? { ...l, precio_unitario: valor, motivo_modificacion: motivo.trim() } : l,
      ),
    )
  }

  const enviar = useMutation({
    mutationFn: () =>
      enviarACaja({
        clienteId: cliente!.id,
        vendedorId: operador!.usuario_id,
        terminalId: terminal!.id,
        terminalPrefijo: terminal!.prefijo ?? 'T',
        lineas,
        observaciones: null,
        listaPrecioId: medio?.lista_precio_id ?? null,
      }),
    onSuccess: (v) => {
      setLineas([])
      setMedioAnticipado(null)
      setCuotasAnticipadas(1)
      setError(null)
      setExito(
        navigator.onLine
          ? `Venta ${v.codigo} enviada a caja`
          : `Venta ${v.codigo} guardada — se envía cuando vuelva la conexión`,
      )
      setTimeout(() => setExito(null), 4000)
      busqueda.current?.focus()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo enviar.'),
  })

  if (cargandoTerminal) return <p className="text-sm text-piedra-500">Cargando…</p>

  if (!terminal) return <ElegirTerminal disponibles={disponibles} onElegir={elegir} />

  if (!operador) {
    return (
      <div className="-m-6 min-h-[calc(100vh-3.5rem)]">
        <IdentificarOperador onIdentificado={identificar} />
      </div>
    )
  }

  const sinStock = lineas.filter((l) => l.cantidad > l.stock_disponible)

  return (
    <div className="flex h-full gap-4" onKeyDown={renovar}>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-tinta">Punto de venta</h1>
            <p className="text-sm text-piedra-500">
              {terminal.nombre} · atiende{' '}
              <span className="font-medium text-tinta">{operador.nombre}</span>
              <button onClick={salir} className="ml-2 text-marca-700 hover:underline">
                cambiar
              </button>
            </p>
          </div>
          {exito && (
            <span className="rounded-full bg-verde-100 px-3 py-1.5 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
              {exito}
            </span>
          )}
        </div>

        <div className="relative">
          <input
            ref={busqueda}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escaneá un código de barra o buscá por nombre…"
            className="w-full rounded-xl border border-borde bg-white py-3 pr-4 pl-4 text-lg text-tinta shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />

          {debounced.length >= 2 && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl bg-white shadow-lg ring-1 ring-borde">
              {resultados.isPending && (
                <p className="px-4 py-3 text-sm text-piedra-400">Buscando…</p>
              )}
              {!resultados.isPending && !resultados.data?.length && (
                <p className="px-4 py-3 text-sm text-piedra-400">Sin resultados.</p>
              )}
              {resultados.data?.map((p) => (
                <button
                  key={p.producto_id}
                  onClick={() => agregar(p)}
                  className="flex w-full items-center justify-between gap-4 border-b border-piedra-100 px-4 py-2.5 text-left last:border-0 hover:bg-marca-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-tinta">{p.nombre_interno}</p>
                    <p className="font-mono text-xs text-piedra-400">{p.codigo}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums text-tinta">
                      {moneda.format(p.precio_venta)}
                    </p>
                    <p
                      className={`text-xs tabular-nums ${
                        p.cantidad <= 0 ? 'text-red-600' : 'text-piedra-400'
                      }`}
                    >
                      {numero.format(p.cantidad)} {p.unidad_medida}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <div className="h-full overflow-y-auto">
            {!lineas.length ? (
              <p className="px-4 py-16 text-center text-sm text-piedra-400">
                Escaneá o buscá un producto para empezar.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="w-28 px-3 py-2.5 text-center font-medium">Cantidad</th>
                    <th className="w-32 px-3 py-2.5 text-right font-medium">Precio</th>
                    <th className="w-32 px-4 py-2.5 text-right font-medium">Importe</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-piedra-100">
                  {lineas.map((l) => {
                    const falta = l.cantidad > l.stock_disponible
                    return (
                      <tr key={l.id} className={falta ? 'bg-amber-50/60' : ''}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-tinta">{l.descripcion}</p>
                          <p className="font-mono text-xs text-piedra-400">{l.codigo_producto}</p>
                          {falta && (
                            <p className="mt-0.5 text-xs text-amber-700">
                              Hay {numero.format(l.stock_disponible)} en stock
                            </p>
                          )}
                          {l.motivo_modificacion && (
                            <p className="mt-0.5 text-xs text-marca-700">
                              Precio modificado: {l.motivo_modificacion}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step={pasoCantidad(l.unidad_medida)}
                            value={l.cantidad}
                            onChange={(e) => cambiarCantidad(l.id, Number(e.target.value))}
                            className="w-full rounded-lg border border-borde px-2 py-1 text-center tabular-nums outline-none focus:border-marca-500"
                          />
                          {esFraccionable(l.unidad_medida) && (
                            <p className="mt-0.5 text-center text-xs text-piedra-400">
                              {l.unidad_medida}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => cambiarPrecio(l.id)}
                            className="tabular-nums text-tinta hover:text-marca-700 hover:underline"
                            title="Modificar el precio de esta línea"
                          >
                            {moneda.format(l.precio_unitario)}
                          </button>
                          {l.precio_unitario !== l.precio_original && (
                            <p className="text-xs text-piedra-400 line-through">
                              {moneda.format(l.precio_original)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-tinta">
                          {moneda.format(l.cantidad * l.precio_unitario)}
                        </td>
                        <td className="pr-3">
                          <button
                            onClick={() => cambiarCantidad(l.id, 0)}
                            className="rounded p-1 text-piedra-300 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Quitar ${l.descripcion}`}
                          >
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col gap-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <p className="mb-2 text-xs font-medium tracking-wide text-piedra-400 uppercase">Cliente</p>
          {buscandoCliente ? (
            <div>
              <input
                autoFocus
                value={textoCliente}
                onChange={(e) => setTextoCliente(e.target.value)}
                placeholder="Nombre o documento…"
                className="w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm outline-none focus:border-marca-500"
              />
              <div className="mt-1 max-h-56 overflow-y-auto">
                {clientes.data?.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCliente(c)
                      setBuscandoCliente(false)
                      setTextoCliente('')
                      busqueda.current?.focus()
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-marca-50"
                  >
                    <span className="font-medium text-tinta">{c.nombre}</span>
                    {c.numero_documento && (
                      <span className="ml-1 text-xs text-piedra-400">{c.numero_documento}</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setBuscandoCliente(false)}
                className="mt-1 text-xs text-piedra-500 hover:underline"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setBuscandoCliente(true)}
              className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-piedra-50"
            >
              <span className="font-medium text-tinta">{cliente?.nombre ?? 'Cargando…'}</span>
              {cliente && cliente.descuento_porcentaje > 0 && (
                <span className="ml-2 rounded-full bg-verde-100 px-2 py-0.5 text-xs text-verde-800">
                  {numero.format(cliente.descuento_porcentaje)}% dto.
                </span>
              )}
              <span className="mt-0.5 block text-xs text-piedra-400">tocá para cambiar</span>
            </button>
          )}
        </div>

        {/*
          El vendedor pregunta cómo va a pagar antes de mandar a caja: le
          pide la tarjeta, mira si hay promoción, lo resuelve ahí. La caja
          recibe la venta con el precio correcto y el cliente no escucha
          dos números distintos. Se puede cambiar en la caja igual, porque
          la tarjeta puede no pasar.
        */}
        {lineas.length > 0 && (
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
            <p className="mb-2 text-xs font-medium tracking-wide text-piedra-400 uppercase">
              ¿Cómo va a pagar?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {medios
                .filter((m) => m.tipo !== 'cuenta_corriente' || cliente?.cuenta_corriente)
                .flatMap((m: MedioPago) =>
                  m.admite_cuotas
                    ? Array.from({ length: m.cuotas_maximas }, (_, i) => i + 1).map((n) => ({
                        m,
                        n,
                        clave: `${m.id}-${n}`,
                        etiqueta: `${m.nombre} ${n}c`,
                      }))
                    : [{ m, n: 1, clave: m.id, etiqueta: m.nombre }],
                )
                .map(({ m, n, clave, etiqueta }) => {
                  const activo = medioAnticipado === m.id && cuotasAnticipadas === n
                  return (
                    <button
                      key={clave}
                      onClick={() => {
                        renovar()
                        if (activo) {
                          setMedioAnticipado(null)
                          setCuotasAnticipadas(1)
                        } else {
                          setMedioAnticipado(m.id)
                          setCuotasAnticipadas(n)
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
                        activo
                          ? 'bg-marca-700 text-white ring-marca-700'
                          : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  )
                })}
            </div>
            {!medio && (
              <p className="mt-2 text-xs text-piedra-400">
                Si no se elige, la caja decide y el total puede cambiar.
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-piedra-500">
              <dt>{numero.format(totales.unidades)} unidades</dt>
              <dd className="tabular-nums">{moneda.format(totales.bruto)}</dd>
            </div>
            {totales.descuentoLineas > 0 && (
              <div className="flex justify-between text-marca-700">
                <dt>Ajustes de precio</dt>
                <dd className="tabular-nums">−{moneda.format(totales.descuentoLineas)}</dd>
              </div>
            )}
            {totales.descuentoCliente > 0 && (
              <div className="flex justify-between text-verde-700">
                <dt>Descuento del cliente</dt>
                <dd className="tabular-nums">−{moneda.format(totales.descuentoCliente)}</dd>
              </div>
            )}
            {/*
              Mientras no se sepa cómo paga, el número grande es el de
              tarjeta y el efectivo va debajo como beneficio: es como
              cotizan. Una vez elegido el medio, manda ese.
            */}
            <div className="flex items-baseline justify-between border-t border-borde pt-2">
              <dt className="font-medium text-tinta">
                {medio ? `Total ${medio.nombre.toLowerCase()}` : 'Total'}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums text-tinta">
                {moneda.format(medio ? totales.elegido : totales.conTarjeta)}
              </dd>
            </div>
            {!medio && listaTarjeta && listaTarjeta.ajuste_porcentaje !== 0 && totales.contado > 0 && (
              <div className="flex items-baseline justify-between rounded-lg bg-verde-50 px-2.5 py-1.5 ring-1 ring-verde-200">
                <dt className="text-sm font-medium text-verde-800">Pagando en efectivo</dt>
                <dd className="text-base font-semibold tabular-nums text-verde-800">
                  {moneda.format(totales.contado)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {sinStock.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-200">
            {sinStock.length === 1 ? 'Un producto supera' : `${sinStock.length} productos superan`} el
            stock disponible. Se puede vender igual: el sistema lo va a marcar como sobrevendido para
            que alguien lo revise.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <button
          onClick={() => enviar.mutate()}
          disabled={!lineas.length || !cliente || enviar.isPending}
          className="rounded-xl bg-marca-700 px-4 py-4 text-base font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {enviar.isPending ? 'Enviando…' : 'Enviar a caja'}
        </button>

        {lineas.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('¿Descartar la venta en curso?')) setLineas([])
            }}
            className="text-sm text-piedra-500 hover:text-red-600 hover:underline"
          >
            Descartar venta
          </button>
        )}
      </aside>
    </div>
  )
}

function ElegirTerminal({
  disponibles,
  onElegir,
}: {
  disponibles: { id: string; nombre: string; tipo: string; prefijo: string | null }[]
  onElegir: (t: never) => void
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-tinta">¿Qué terminal es esta máquina?</h1>
        <p className="mt-1 text-sm text-piedra-500">
          Se elige una vez por computadora. Define el prefijo de numeración y, en las cajas, a qué
          impresora sale el comprobante.
        </p>
      </div>
      <div className="space-y-2">
        {disponibles.map((t) => (
          <button
            key={t.id}
            onClick={() => onElegir(t as never)}
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-borde hover:ring-marca-400"
          >
            <span className="font-medium text-tinta">{t.nombre}</span>
            <span className="text-xs text-piedra-400">
              {t.tipo} · {t.prefijo}
            </span>
          </button>
        ))}
        {!disponibles.length && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
            No hay terminales configuradas. Hay que darlas de alta antes de poder vender.
          </p>
        )}
      </div>
    </div>
  )
}
