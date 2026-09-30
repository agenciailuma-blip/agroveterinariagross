import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { historialDeProducto, puntosDeLaLinea, textoDeVariacion, variacion } from '@/lib/api/costos'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'

/*
  El historial de costos, en la ficha del producto.

  Lo pidió Lucas el 14/08: saber si la última compra vino más cara o más
  barata que la anterior, y de quién. Va cerrado, porque la ficha se usa
  sobre todo para cambiar un precio: se abre cuando hace falta, y recién
  ahí se pregunta a la base.

  Lo ve quien ve las compras. Al vendedor no le hace falta saber cuánto
  costó lo que vende.
*/
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString('es-AR')

export default function HistorialDeCostos({ productoId }: { productoId: string }) {
  const { tienePermiso } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const puede = tienePermiso('compras.ver')

  const historia = useQuery({
    queryKey: ['historial-costo', productoId],
    queryFn: () => historialDeProducto(productoId),
    enabled: abierto && puede,
  })

  if (!puede) return null

  const filas = historia.data ?? []
  // La línea va del más viejo al más nuevo; la tabla, al revés.
  const costos = [...filas].reverse().map((f) => f.costo)
  const ultima = filas[0]
  const puntos = puntosDeLaLinea(costos, 120, 28)

  return (
    <div className="col-span-2 sm:col-span-4">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:underline"
      >
        <svg
          className={`size-3.5 transition-transform ${abierto ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Historial de costos
      </button>

      {abierto && (
        <div className="mt-2 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
          {historia.isPending && <p className="text-xs text-piedra-500">Cargando…</p>}
          {historia.isError && (
            <p className="text-xs text-red-700">{enCastellano(historia.error, 'No se pudo traer el historial.')}</p>
          )}
          {!historia.isPending && filas.length === 0 && (
            <p className="text-xs text-piedra-500">
              Todavía no se recibió mercadería de este producto. El historial se arma solo, con cada factura que se
              recibe en Compras.
            </p>
          )}

          {ultima && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde pb-2">
              <p className="text-xs text-piedra-600">
                Último: <strong className="text-tinta">{moneda.format(ultima.costo)}</strong> de {ultima.proveedor}, el{' '}
                {fechaCorta(ultima.fecha)}
                {ultima.costo_previo !== null && (
                  <>
                    {' '}
                    · <Variacion v={variacion(ultima.costo, ultima.costo_previo)} /> contra la anterior
                    {ultima.proveedor_previo && ultima.proveedor_previo !== ultima.proveedor
                      ? ` (de ${ultima.proveedor_previo})`
                      : ''}
                  </>
                )}
              </p>
              {puntos && (
                <svg viewBox="0 0 120 28" className="h-7 w-28 shrink-0" aria-label="Cómo fue cambiando el costo">
                  <polyline
                    points={puntos}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="text-marca-700"
                  />
                </svg>
              )}
            </div>
          )}

          {/*
            Una compra por renglón, la más nueva arriba. En el celular la
            factura y la cantidad van debajo del proveedor.
          */}
          <ul className="divide-y divide-piedra-100 text-sm">
            {filas.map((f) => (
              <li key={f.id} className="flex items-start gap-3 py-1.5">
                <span className="w-20 shrink-0 tabular-nums text-piedra-500">{fechaCorta(f.fecha)}</span>
                <span className="min-w-0 flex-1">
                  <Link
                    to={`/proveedores/cuentas?p=${f.proveedor_id}`}
                    className="block truncate text-tinta hover:text-marca-700 hover:underline"
                  >
                    {f.proveedor}
                  </Link>
                  <span className="block truncate text-xs text-piedra-500">
                    {f.factura} · {numero.format(f.cantidad)} u.
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums text-tinta">{moneda.format(f.costo)}</span>
                  <span className="block text-xs">
                    <Variacion v={variacion(f.costo, f.costo_previo)} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* Subió en ámbar, bajó en verde: desde el lado del que compra. */
export function Variacion({ v }: { v: number | null }) {
  if (v === null) return null
  const color = Math.abs(v) < 0.005 ? 'text-piedra-500' : v > 0 ? 'text-amber-700' : 'text-verde-700'
  return <span className={`tabular-nums ${color}`}>{textoDeVariacion(v)}</span>
}
