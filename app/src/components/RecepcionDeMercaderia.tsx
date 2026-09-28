import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  alicuotasDeIva,
  altaRapidaDeProducto,
  aplicarPrecioSugerido,
  buscarProductoParaRecibir,
  costoConIva,
  numeroDeComprobante,
  recibirMercaderia,
  variacionDeCosto,
} from '@/lib/api/compras'
import type { FilaCompra, ProductoParaRecibir, Recibido } from '@/lib/api/compras'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  Recibir la mercadería de una factura de compra.

  Se hace sobre una factura ya cargada, en el momento o después: a veces
  la carga la misma persona de una vez y a veces dos personas distintas
  (Lucas, audio 3 del 10/09).

  Lo que pasa al confirmar, y las tres decisiones del 28/09:
  · entra el stock;
  · el costo del producto pasa a ser el de esta factura (el último pisa);
  · el precio de venta NO cambia: se propone el que corresponde por el
    margen, y alguien lo aplica. Un costo no puede mover un precio sin
    que nadie lo vea.

  Un producto que no está en el catálogo se da de alta ahí mismo, con lo
  mínimo, y se completa después en Productos.
*/

interface Renglon {
  producto: ProductoParaRecibir
  cantidad: string
  costo: string
}

const numeroDe = (t: string) => {
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function RecepcionDeMercaderia({
  compra,
  onCerrar,
}: {
  compra: FilaCompra
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const alicuotas = useQuery({ queryKey: ['alicuotas-iva'], queryFn: alicuotasDeIva })
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [recibido, setRecibido] = useState<Recibido[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clase = compra.tipo?.clase ?? null
  const discrimina = clase === 'A' || clase === 'M'
  const porcentajeDe = (id: number) => alicuotas.data?.find((a) => a.id === id)?.porcentaje ?? 0

  /*
    La suma de los renglones, para compararla con el papel. En una A se
    compara contra el neto (los unitarios son sin IVA); en una B o C,
    contra el total. No frena nada —puede haber fletes, bonificaciones,
    renglones que no son mercadería— pero una diferencia grande casi
    siempre es una cantidad mal tipeada.
  */
  const suma = renglones.reduce((t, r) => t + numeroDe(r.cantidad) * numeroDe(r.costo), 0)
  const contra = discrimina
    ? Number(compra.neto_gravado) + Number(compra.neto_no_gravado) + Number(compra.exento)
    : Number(compra.total)

  const recibir = useMutation({
    mutationFn: () =>
      recibirMercaderia(
        compra.id,
        renglones.map((r) => ({
          producto_id: r.producto.producto_id,
          cantidad: numeroDe(r.cantidad),
          costo_unitario: numeroDe(r.costo),
        })),
      ),
    onSuccess: (r) => {
      setRecibido(r)
      qc.invalidateQueries({ queryKey: ['compras'] })
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo recibir la mercadería.')),
  })

  function agregar(p: ProductoParaRecibir) {
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto.producto_id === p.producto_id)
      // Pasar el lector dos veces por la misma caja suma una unidad, como en la caja.
      if (i >= 0) {
        return rs.map((r, j) => (j === i ? { ...r, cantidad: String(numeroDe(r.cantidad) + 1) } : r))
      }
      return [...rs, { producto: p, cantidad: '1', costo: '' }]
    })
  }

  const falta =
    renglones.length === 0 || renglones.some((r) => numeroDe(r.cantidad) <= 0 || r.costo.trim() === '')

  const titulo = `${compra.tipo?.descripcion ?? 'Factura'} ${numeroDeComprobante(compra.punto_venta, compra.numero)} · ${compra.proveedor?.nombre ?? ''}`

  if (recibido) {
    return <Resultado titulo={titulo} recibido={recibido} onCerrar={onCerrar} />
  }

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">Recibir la mercadería</h2>
      <p className="mt-0.5 text-sm text-piedra-500">{titulo}</p>
      <p className="mt-2 text-sm text-piedra-500">
        {discrimina
          ? 'Es una factura A: copiá el costo unitario sin IVA, como está impreso. El sistema le suma el IVA de cada producto.'
          : 'Copiá el costo unitario como está impreso: en esta factura ya incluye el IVA.'}
      </p>

      <Buscador
        onElegir={agregar}
        proveedorId={compra.proveedor_id}
        alicuotas={alicuotas.data ?? []}
      />

      {renglones.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="w-24 py-2 pr-3 font-medium">Cantidad</th>
                <th className="w-32 py-2 pr-3 font-medium">
                  Costo unitario{discrimina ? ' (sin IVA)' : ''}
                </th>
                <th className="py-2 pr-3 text-right font-medium">Queda en el producto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => {
                const nuevo = r.costo.trim() === ''
                  ? null
                  : costoConIva(numeroDe(r.costo), clase, porcentajeDe(r.producto.alicuota_iva_id))
                const anterior = r.producto.costo === null ? null : Number(r.producto.costo)
                const variacion = variacionDeCosto(anterior, nuevo)
                return (
                  <tr key={r.producto.producto_id} className="border-b border-piedra-50 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="text-tinta">{r.producto.nombre_interno}</span>{' '}
                      <span className="font-mono text-xs text-piedra-400">{r.producto.codigo}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={r.cantidad}
                        onChange={(e) =>
                          setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))
                        }
                        inputMode="decimal"
                        className={campo}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={r.costo}
                        onChange={(e) =>
                          setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))
                        }
                        inputMode="decimal"
                        className={campo}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {nuevo === null || nuevo <= 0 ? (
                        <span className="text-piedra-400">
                          {nuevo === 0 ? 'Sin costo: no lo cambia' : '—'}
                        </span>
                      ) : (
                        <>
                          <span className="text-tinta">{moneda.format(nuevo)}</span>
                          {variacion !== null && variacion !== 0 && (
                            <span className={`ml-1.5 text-xs ${variacion > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                              {variacion > 0 ? '+' : ''}
                              {variacion.toLocaleString('es-AR')}%
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}
                        className="rounded-lg px-2 py-1 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <p className="mt-3 text-sm text-piedra-600">
            Suma de los renglones: <strong className="tabular-nums text-tinta">{moneda.format(suma)}</strong>
            {' · '}
            {discrimina ? 'neto de la factura' : 'total de la factura'}:{' '}
            <strong className="tabular-nums text-tinta">{moneda.format(contra)}</strong>
            {Math.abs(suma - contra) > 1 && (
              <span className="ml-1 text-amber-700">
                — no coinciden. Puede ser un flete o una bonificación, o una cantidad mal tipeada.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-piedra-100 pt-4">
        <button onClick={onCerrar} className={boton.suave}>
          Cancelar
        </button>
        <button
          onClick={() => {
            setError(null)
            recibir.mutate()
          }}
          disabled={falta || recibir.isPending}
          title={falta ? 'Cada renglón necesita cantidad y costo' : undefined}
          className={boton.principal}
        >
          {recibir.isPending ? 'Recibiendo…' : 'Entrar al stock'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}

/*
  El buscador del renglón: se escribe o se pasa el lector, Enter busca.
  Si no aparece, se ofrece el alta rápida con lo que se escribió.
*/
function Buscador({
  onElegir,
  proveedorId,
  alicuotas,
}: {
  onElegir: (p: ProductoParaRecibir) => void
  proveedorId: string
  alicuotas: { id: number; descripcion: string }[]
}) {
  const [texto, setTexto] = useState('')
  const [buscado, setBuscado] = useState('')
  const [alta, setAlta] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const resultados = useQuery({
    queryKey: ['recepcion-buscar', buscado],
    queryFn: () => buscarProductoParaRecibir(buscado),
    enabled: buscado.length > 0,
  })

  function elegir(p: ProductoParaRecibir) {
    onElegir(p)
    setTexto('')
    setBuscado('')
    setAlta(false)
    entrada.current?.focus()
  }

  // Con el lector llega un código exacto y un solo resultado: entra solo.
  // Si el texto es exactamente el código de barras o el código interno,
  // no hace falta elegirlo de una lista de uno.
  const unico = resultados.data?.length === 1 ? resultados.data[0] : null
  const exacto = !!unico && (unico.por_barra || unico.codigo.toUpperCase() === buscado.toUpperCase())
  useEffect(() => {
    if (unico && exacto) elegir(unico)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unico, exacto])

  return (
    <div className="mt-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">
          Agregar producto — código, código de barras o nombre, y Enter
        </span>
        <input
          ref={entrada}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              setAlta(false)
              setBuscado(texto.trim())
            }
          }}
          autoFocus
          className={campo}
        />
      </label>

      {buscado && resultados.data && (
        <div className="mt-2 rounded-lg ring-1 ring-borde">
          {resultados.data.map((p) => (
            <button
              key={p.producto_id}
              onClick={() => elegir(p)}
              className="flex w-full items-center justify-between gap-3 border-b border-piedra-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-marca-50"
            >
              <span className="text-tinta">{p.nombre_interno}</span>
              <span className="font-mono text-xs text-piedra-400">{p.codigo}</span>
            </button>
          ))}

          {resultados.data.length === 0 && !alta && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="text-piedra-600">«{buscado}» no está en el catálogo.</span>
              <button onClick={() => setAlta(true)} className={botonChico.secundario}>
                Darlo de alta
              </button>
            </div>
          )}

          {alta && (
            <AltaRapida
              sugerido={buscado}
              proveedorId={proveedorId}
              alicuotas={alicuotas}
              onCreado={elegir}
              onCancelar={() => setAlta(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AltaRapida({
  sugerido,
  proveedorId,
  alicuotas,
  onCreado,
  onCancelar,
}: {
  sugerido: string
  proveedorId: string
  alicuotas: { id: number; descripcion: string }[]
  onCreado: (p: ProductoParaRecibir) => void
  onCancelar: () => void
}) {
  // Si lo que se escribió parece un código (sin espacios), va como código;
  // si no, como nombre.
  const pareceCodigo = !/\s/.test(sugerido)
  const [codigo, setCodigo] = useState(pareceCodigo ? sugerido : '')
  const [nombre, setNombre] = useState(pareceCodigo ? '' : sugerido.toUpperCase())
  const [alicuota, setAlicuota] = useState(5)
  const [error, setError] = useState<string | null>(null)

  const crear = useMutation({
    mutationFn: () =>
      altaRapidaDeProducto({
        codigo,
        nombre_interno: nombre,
        alicuota_iva_id: alicuota,
        proveedor_id: proveedorId,
      }),
    onSuccess: onCreado,
    onError: (e) => setError(enCastellano(e, 'No se pudo dar de alta el producto.')),
  })

  return (
    <div className="border-t border-piedra-100 bg-piedra-50/60 p-3">
      <p className="text-xs text-piedra-500">
        Alta rápida: lo mínimo para que entre al stock. Queda <strong>sin precio de venta</strong> y
        sin revisar, así aparece primero en Productos para completarlo.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-piedra-600">Código</span>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={campo} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-piedra-600">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-piedra-600">IVA</span>
          <select value={alicuota} onChange={(e) => setAlicuota(Number(e.target.value))} className={campo}>
            {alicuotas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.descripcion}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancelar} className={botonChico.suave}>
          Cancelar
        </button>
        <button
          onClick={() => {
            setError(null)
            crear.mutate()
          }}
          disabled={!codigo.trim() || !nombre.trim() || crear.isPending}
          className={botonChico.principal}
        >
          {crear.isPending ? 'Creando…' : 'Crear y agregar'}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

/*
  Lo que pasó, y los precios que conviene revisar.

  Vienen marcados los que tienen un precio sugerido distinto del actual.
  Nada se aplica sin apretar el botón.
*/
function Resultado({
  titulo,
  recibido,
  onCerrar,
}: {
  titulo: string
  recibido: Recibido[]
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const aRevisar = recibido.filter(
    (r) => r.precio_sugerido !== null && Math.abs(r.precio_sugerido - r.precio_actual) >= 0.01,
  )
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(aRevisar.map((r) => r.producto_id)))
  const [aplicados, setAplicados] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const aplicar = useMutation({
    mutationFn: () => aplicarPrecioSugerido([...elegidos]),
    onSuccess: (n) => {
      setAplicados(n)
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
    onError: (e) => setError(enCastellano(e, 'No se pudieron cambiar los precios.')),
  })

  const sinPrecio = recibido.filter((r) => r.precio_actual <= 0)
  const sinMargen = recibido.filter((r) => r.margen_objetivo === null && r.precio_actual > 0)

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">Mercadería recibida</h2>
      <p className="mt-0.5 text-sm text-piedra-500">{titulo}</p>
      <p className="mt-2 text-sm text-emerald-700">
        Entraron al stock {recibido.length} producto{recibido.length === 1 ? '' : 's'}, y su costo
        quedó actualizado.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="py-2 pr-3 text-right font-medium">Costo antes</th>
              <th className="py-2 pr-3 text-right font-medium">Costo ahora</th>
              <th className="py-2 pr-3 text-right font-medium">Precio actual</th>
              <th className="py-2 pr-3 text-right font-medium">Precio sugerido</th>
              <th className="py-2 text-center font-medium">Aplicar</th>
            </tr>
          </thead>
          <tbody>
            {recibido.map((r) => {
              const variacion = variacionDeCosto(r.costo_anterior, r.costo_nuevo)
              const distinto = aRevisar.some((x) => x.producto_id === r.producto_id)
              return (
                <tr key={r.producto_id} className="border-b border-piedra-50 last:border-0">
                  <td className="py-2 pr-3 text-tinta">{r.nombre}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-piedra-500">
                    {r.costo_anterior === null ? '—' : moneda.format(r.costo_anterior)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-tinta">
                    {r.costo_nuevo === null ? '—' : moneda.format(r.costo_nuevo)}
                    {variacion !== null && variacion !== 0 && (
                      <span className={`ml-1.5 text-xs ${variacion > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {variacion > 0 ? '+' : ''}
                        {variacion.toLocaleString('es-AR')}%
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.precio_actual > 0 ? moneda.format(r.precio_actual) : <span className="text-red-700">Sin precio</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.precio_sugerido === null ? (
                      <span className="text-piedra-400">Sin margen</span>
                    ) : (
                      moneda.format(r.precio_sugerido)
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {distinto && aplicados === null && (
                      <input
                        type="checkbox"
                        checked={elegidos.has(r.producto_id)}
                        onChange={(e) =>
                          setElegidos((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(r.producto_id)
                            else n.delete(r.producto_id)
                            return n
                          })
                        }
                        aria-label={`Aplicar el precio sugerido a ${r.nombre}`}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {sinPrecio.length > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {sinPrecio.map((r) => r.nombre).join(', ')}: sin precio de venta. No se puede vender hasta
          ponérselo en Productos.
        </p>
      )}
      {sinMargen.length > 0 && (
        <p className="mt-2 text-xs text-piedra-500">
          Los que dicen «sin margen» no tienen un margen cargado en su ficha, así que no hay precio
          que proponer. Si se le carga el margen, la ficha calcula el precio.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-piedra-100 pt-4">
        {aplicados !== null ? (
          <span className="text-sm text-emerald-700">
            {aplicados} precio{aplicados === 1 ? '' : 's'} actualizado{aplicados === 1 ? '' : 's'}.
          </span>
        ) : (
          aRevisar.length > 0 && (
            <button
              onClick={() => {
                setError(null)
                aplicar.mutate()
              }}
              disabled={elegidos.size === 0 || aplicar.isPending}
              className={boton.secundario}
            >
              {aplicar.isPending
                ? 'Aplicando…'
                : `Aplicar el precio sugerido a ${elegidos.size}`}
            </button>
          )
        )}
        <button onClick={onCerrar} className={boton.principal}>
          Listo
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
