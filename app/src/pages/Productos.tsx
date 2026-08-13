import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ESTADO_STOCK, moneda, numero } from '@/lib/tipos'
import type { EstadoStock } from '@/lib/tipos'

interface FilaProducto {
  producto_id: string
  codigo: string
  nombre_interno: string
  nombre_publico: string | null
  precio_venta: number
  unidad_medida: string
  cantidad: number
  estado: EstadoStock
  activo: boolean
  revisado_en: string | null
}

const POR_PAGINA = 50

async function buscarProductos(texto: string, soloSinRevisar: boolean) {
  let q = supabase
    .from('vista_stock')
    .select(
      'producto_id, codigo, nombre_interno, nombre_publico, precio_venta, unidad_medida, cantidad, estado, activo, revisado_en',
      { count: 'exact' },
    )
    .order('nombre_interno')
    .limit(POR_PAGINA)

  if (texto) {
    // El índice de trigramas hace que esto siga siendo rápido aunque la
    // búsqueda empiece con comodín, que es lo que necesita el vendedor:
    // tipea "livra" y tiene que encontrar ALIM BAL LIVRA 15KG.
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron},nombre_publico.ilike.${patron}`)
  }
  if (soloSinRevisar) q = q.is('revisado_en', null)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { filas: (data ?? []) as FilaProducto[], total: count ?? 0 }
}

export default function Productos() {
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [soloSinRevisar, setSoloSinRevisar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  // El lector de códigos de barra escribe como un teclado, así que el
  // foco tiene que estar siempre en el buscador para que funcione sin
  // que nadie haga clic en ningún lado.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data, isPending, error } = useQuery({
    queryKey: ['productos', debounced, soloSinRevisar],
    queryFn: () => buscarProductos(debounced, soloSinRevisar),
  })

  const hayMas = useMemo(
    () => (data?.total ?? 0) > (data?.filas.length ?? 0),
    [data],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Productos</h1>
          <p className="text-sm text-slate-500">
            {data ? `${numero.format(data.total)} productos` : 'Cargando…'}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={soloSinRevisar}
            onChange={(e) => setSoloSinRevisar(e.target.checked)}
            className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
          />
          Sólo sin revisar
        </label>
      </div>

      <div className="relative">
        <svg
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código, nombre o escanear un código de barra…"
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pr-4 pl-11 text-slate-900 shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                <th className="px-4 py-3 text-right font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isPending && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    Buscando…
                  </td>
                </tr>
              )}

              {!isPending && data?.filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    {debounced
                      ? `No hay productos que coincidan con “${debounced}”.`
                      : 'Todavía no hay productos cargados.'}
                  </td>
                </tr>
              )}

              {data?.filas.map((p) => {
                const estado = ESTADO_STOCK[p.estado]
                return (
                  <tr key={p.producto_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.codigo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.nombre_interno}</div>
                      {p.nombre_publico && (
                        <div className="text-xs text-slate-500">{p.nombre_publico}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 tabular-nums">
                      {moneda.format(p.precio_venta)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {numero.format(p.cantidad)}{' '}
                      <span className="text-xs text-slate-400">{p.unidad_medida}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${estado.clase}`}
                      >
                        {estado.etiqueta}
                      </span>
                      {!p.revisado_en && (
                        <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                          Sin revisar
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {hayMas && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs text-slate-500">
            Mostrando los primeros {POR_PAGINA} de {numero.format(data!.total)}. Afiná la búsqueda
            para ver el resto.
          </div>
        )}
      </div>
    </div>
  )
}
