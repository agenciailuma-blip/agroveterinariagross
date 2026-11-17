import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fotosDe } from '@/lib/api/imagenes'
import type { ProductoVenta } from '@/lib/api/ventas'
import { moneda, numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  La foto del producto marcado en el buscador del mostrador

  Pedido del cliente el 17/11: al bajar con las flechas, ver la foto
  del producto como apoyo visual. Va fija en la columna derecha y no
  flotando al lado de la fila: una foto que salta con cada flecha tapa
  las filas vecinas y se lleva la vista. Fija, se mira de reojo.

  La foto se pide recién cuando la marca se detiene un momento: con la
  flecha apretada no se baja una por fila. La del siguiente se adelanta,
  para que al bajar de a uno aparezca al instante.
  ─────────────────────────────────────────────────────────────
*/

const ESPERA_MS = 120

const consultaFotos = (productoId: string) => ({
  queryKey: ['fotos-producto', productoId],
  queryFn: () => fotosDe(productoId),
  staleTime: 5 * 60_000,
})

export default function VistaPreviaProducto({
  producto,
  siguiente,
  enLinea,
}: {
  producto: ProductoVenta
  siguiente?: ProductoVenta
  enLinea: boolean
}) {
  const [quieto, setQuieto] = useState(producto.producto_id)
  useEffect(() => {
    const t = setTimeout(() => setQuieto(producto.producto_id), ESPERA_MS)
    return () => clearTimeout(t)
  }, [producto.producto_id])

  const detenido = quieto === producto.producto_id
  const fotos = useQuery({ ...consultaFotos(producto.producto_id), enabled: enLinea && detenido })

  // La del siguiente: los datos y el archivo, para que el navegador ya la tenga.
  const cliente = useQueryClient()
  useEffect(() => {
    if (!enLinea || !detenido || !siguiente) return
    void cliente.fetchQuery(consultaFotos(siguiente.producto_id)).then((lista) => {
      if (lista[0]) new Image().src = lista[0].url
    }).catch(() => {})
  }, [cliente, enLinea, detenido, siguiente])

  const lista = fotos.data ?? []
  const [elegida, setElegida] = useState(0)
  useEffect(() => setElegida(0), [producto.producto_id])
  const principal = lista[Math.min(elegida, lista.length - 1)]

  return (
    // Ocupa a lo sumo el lugar que queda en la columna: en una pantalla baja
    // se achica la foto, no se corre la página.
    <div className="flex max-h-full flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
      <div className="flex aspect-square min-h-0 shrink items-center justify-center bg-piedra-50">
        {principal ? (
          <img
            key={principal.id}
            src={principal.url}
            alt={producto.nombre_interno}
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="text-sm text-piedra-400">
            {!enLinea ? 'Sin conexión' : fotos.isFetching || !detenido ? '' : 'Sin foto'}
          </p>
        )}
      </div>

      {lista.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-hidden border-t border-piedra-100 p-2">
          {lista.slice(0, 6).map((f, i) => (
            <button
              key={f.id}
              tabIndex={-1}
              onMouseEnter={() => setElegida(i)}
              onClick={() => setElegida(i)}
              className={`size-10 shrink-0 overflow-hidden rounded-md ring-1 ${
                f === principal ? 'ring-2 ring-marca-500' : 'ring-borde'
              }`}
            >
              <img src={f.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-piedra-100 px-4 py-3">
        <p className="font-medium leading-snug text-tinta">{producto.nombre_interno}</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="text-lg font-semibold tabular-nums text-tinta">{moneda.format(producto.precio_venta)}</p>
          <p className={`text-sm tabular-nums ${producto.cantidad <= 0 ? 'text-red-600' : 'text-piedra-500'}`}>
            {numero.format(producto.cantidad)} {producto.unidad_medida}
          </p>
        </div>
      </div>
    </div>
  )
}
