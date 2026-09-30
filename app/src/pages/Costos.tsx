import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { costosPorProveedor, ordenarCostos } from '@/lib/api/costos'
import type { OrdenCostos } from '@/lib/api/costos'
import { Variacion } from '@/components/HistorialDeCostos'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { campo, campoDeFiltro, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Los costos por proveedor

  La otra mitad del pedido de Lucas del 14/08: no sólo la historia de un
  producto, sino lo que está haciendo cada proveedor. ¿Qué me aumentó
  Fulano en la última factura? ¿Lo tiene otro a menos?

  Un renglón por producto y proveedor: la última compra, la anterior al
  mismo proveedor y cuánto cambió. Si otro proveedor lo vendió más
  barato en su última compra, se dice quién y a cuánto.
  ─────────────────────────────────────────────────────────────
*/

const fechaCorta = (f: string | null) => (f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-AR') : '')

export default function Costos() {
  const [params, setParams] = useSearchParams()
  const proveedorId = params.get('p') ?? ''
  const [buscar, setBuscar] = useState('')
  const [orden, setOrden] = useState<OrdenCostos>('aumento')

  const todos = useQuery({ queryKey: ['costos-por-proveedor'], queryFn: () => costosPorProveedor(null) })

  // Los proveedores a los que alguna vez se les recibió mercadería.
  const proveedores = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of todos.data ?? []) m.set(f.proveedor_id, f.proveedor)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [todos.data])

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const elegidas = (todos.data ?? []).filter(
      (f) =>
        (!proveedorId || f.proveedor_id === proveedorId) &&
        (!q || f.producto.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q)),
    )
    return ordenarCostos(elegidas, orden)
  }, [todos.data, proveedorId, buscar, orden])

  const subieron = filas.filter((f) => (f.variacion ?? 0) > 0.005).length
  const bajaron = filas.filter((f) => (f.variacion ?? 0) < -0.005).length
  const conOtro = filas.filter((f) => f.otro_costo !== null).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Costos por proveedor</h1>
        <p className="text-sm text-piedra-500">
          Lo último que se le compró a cada proveedor, cuánto cambió contra su compra anterior y si otro lo vendió más
          barato. Los costos son con IVA, como quedan en el producto.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Proveedor</span>
          <select
            value={proveedorId}
            onChange={(e) => setParams(e.target.value ? { p: e.target.value } : {})}
            className={`${campoDeFiltro} max-w-full`}
          >
            <option value="">Todos</option>
            {proveedores.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Orden</span>
          <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenCostos)} className={campoDeFiltro}>
            <option value="aumento">Lo que más subió</option>
            <option value="reciente">Lo último que se compró</option>
            <option value="producto">Por producto</option>
          </select>
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Producto</span>
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o código…" className={campo} />
        </label>
      </div>

      {filas.length > 0 && (
        <p className="text-sm text-piedra-600">
          {filas.length === 1 ? '1 producto' : `${filas.length} productos`}
          {subieron > 0 && <span className="text-amber-700"> · {subieron} subieron</span>}
          {bajaron > 0 && <span className="text-verde-700"> · {bajaron} bajaron</span>}
          {conOtro > 0 && <span> · {conOtro} los vendió más barato otro proveedor</span>}
        </p>
      )}

      {/*
        Sin desplazamiento hacia el costado: en el celular quedan el
        producto y el último costo con su variación; lo demás va debajo
        del nombre.
      */}
      <div className={`${tarjeta} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Producto</th>
              {!proveedorId && <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Proveedor</th>}
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Anterior</th>
              <th className="px-4 py-2.5 text-right font-medium">Último</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Otro más barato</th>
            </tr>
          </thead>
          <tbody>
            {todos.isPending && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-piedra-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!todos.isPending && filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-piedra-400">
                  {(todos.data ?? []).length === 0
                    ? 'Todavía no se recibió mercadería. Los costos aparecen solos con cada factura que se recibe en Compras.'
                    : 'No hay productos que coincidan.'}
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={`${f.proveedor_id}-${f.producto_id}`} className="border-b border-piedra-50 last:border-0">
                <td className="px-4 py-2.5 align-top">
                  <p className="text-tinta">{f.producto}</p>
                  <p className="text-xs text-piedra-500">
                    <span className="font-mono">{f.codigo}</span>
                    {!proveedorId && <span className="lg:hidden"> · {f.proveedor}</span>}
                  </p>
                  {f.costo_anterior !== null && (
                    <p className="text-xs tabular-nums text-piedra-500 md:hidden">antes {moneda.format(f.costo_anterior)}</p>
                  )}
                  {f.otro_costo !== null && (
                    <p className="text-xs text-verde-700 sm:hidden">
                      {f.otro_proveedor} a {moneda.format(f.otro_costo)}
                    </p>
                  )}
                </td>
                {!proveedorId && (
                  <td className="hidden px-4 py-2.5 align-top lg:table-cell">
                    <Link to={`/proveedores/cuentas?p=${f.proveedor_id}`} className="text-tinta hover:text-marca-700 hover:underline">
                      {f.proveedor}
                    </Link>
                  </td>
                )}
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-right align-top tabular-nums text-piedra-600 md:table-cell">
                  {f.costo_anterior !== null ? moneda.format(f.costo_anterior) : <span className="text-piedra-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right align-top">
                  <p className="font-medium tabular-nums text-tinta">{moneda.format(f.ultimo_costo)}</p>
                  <p className="text-xs">
                    <Variacion v={f.variacion} />
                    <span className="ml-1 tabular-nums text-piedra-400">{fechaCorta(f.ultima_fecha)}</span>
                  </p>
                </td>
                <td className="hidden px-4 py-2.5 align-top sm:table-cell">
                  {f.otro_costo !== null ? (
                    <>
                      <p className="text-verde-700">{f.otro_proveedor}</p>
                      <p className="text-xs tabular-nums text-piedra-500">
                        {moneda.format(f.otro_costo)} · {fechaCorta(f.otro_fecha)}
                      </p>
                    </>
                  ) : (
                    ''
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {todos.isError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {enCastellano(todos.error, 'No se pudieron traer los costos.')}
        </p>
      )}
    </div>
  )
}
