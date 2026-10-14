import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buscarEnvases, cadenaDeEnvases, obtenerEnvase } from '@/lib/api/catalogo'
import { describirCadena, precioDividido, totalEnLaMasChica } from '@/lib/envases'
import { moneda, numero } from '@/lib/tipos'
import { botonChico } from '@/estilos'

/*
  La caja y la suelta, en la ficha del producto.

  Pedido de Lucas del 07/10: cargar la caja como llega y vender por
  pastilla sin que el stock diga dos cosas. Cada nivel es un producto
  —con su precio y su código—, y la suelta dice de qué envase sale y
  cuántas trae. Al vender una suelta cuando no quedan, la base abre un
  envase sola.

  Se ata desde la suelta («sale de adentro de…») porque es la suelta la
  que sabe cuántas trae su envase. Desde la caja se ve en qué se abre, y
  si todavía no tiene suelta, se la crea con los datos de la caja ya
  puestos.
*/

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

interface Props {
  /** null en un producto nuevo: todavía no tiene cadena que mostrar. */
  productoId: string | null
  envaseId: string | null
  cantidadPorEnvase: number | null
  onCambio: (envaseId: string | null, cantidadPorEnvase: number | null) => void
  /** Sin permiso para crear productos no se pasa, y el botón no aparece. */
  onCrearSuelta?: () => void
}

export default function CajaYSuelto({ productoId, envaseId, cantidadPorEnvase, onCambio, onCrearSuelta }: Props) {
  const [buscando, setBuscando] = useState(false)
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  const cadena = useQuery({
    queryKey: ['cadena-envases', productoId],
    queryFn: () => cadenaDeEnvases(productoId!),
    enabled: !!productoId,
  })

  const envase = useQuery({
    queryKey: ['envase', envaseId],
    queryFn: () => obtenerEnvase(envaseId!),
    enabled: !!envaseId,
  })

  const resultados = useQuery({
    queryKey: ['buscar-envase', debounced, productoId],
    queryFn: () => buscarEnvases(debounced, productoId),
    enabled: buscando && debounced.length > 1,
  })

  const niveles = cadena.data ?? []
  const atado = niveles.length > 1
  const yo = niveles.find((n) => n.producto_id === productoId)
  const suelta = yo ? niveles.find((n) => n.nivel === yo.nivel + 1) : undefined
  const masChica = niveles[niveles.length - 1]
  const sugerido =
    envase.data && cantidadPorEnvase ? precioDividido(Number(envase.data.precio_venta), cantidadPorEnvase) : null
  const costoHeredado =
    envase.data?.costo && cantidadPorEnvase && cantidadPorEnvase > 0
      ? Number(envase.data.costo) / cantidadPorEnvase
      : null

  function elegir(id: string) {
    onCambio(id, cantidadPorEnvase)
    setBuscando(false)
    setTexto('')
  }

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4">
      {/* Lo que hay, de la caja a la pastilla. Es la respuesta a «¿cuántas tengo?». */}
      {atado && (
        <div className="rounded-lg bg-marca-50 px-3 py-2 text-xs text-marca-800 ring-1 ring-marca-200">
          <p className="font-medium">En stock: {describirCadena(niveles)}</p>
          {masChica && (
            <p className="mt-0.5 text-marca-700">
              Contado en {masChica.nombre_interno}: {numero.format(totalEnLaMasChica(niveles))}. Cuando se vende
              una suelta y no quedan, el sistema abre una sola.
            </p>
          )}
        </div>
      )}

      {/* ¿De qué envase sale éste? */}
      <div>
        <p className="mb-1 text-xs font-medium text-piedra-600">Sale de adentro de</p>
        {envaseId ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-tinta">
                  {envase.data?.nombre_interno ?? 'Cargando…'}
                </p>
                {envase.data && <p className="font-mono text-xs text-piedra-400">{envase.data.codigo}</p>}
              </div>
              <button type="button" onClick={() => onCambio(null, null)} className={botonChico.suave}>
                Quitar
              </button>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">¿Cuántas trae cada uno?</span>
              <input
                type="number"
                step="any"
                min="0"
                value={cantidadPorEnvase ?? ''}
                onChange={(e) => onCambio(envaseId, e.target.value === '' ? null : Number(e.target.value))}
                className={`${claseInput} text-right tabular-nums sm:w-40`}
                placeholder="10"
              />
            </label>
            {(sugerido !== null || costoHeredado !== null) && (
              <p className="text-xs text-piedra-500">
                {sugerido !== null && (
                  <>
                    Dividiendo el precio del envase da <strong>{moneda.format(sugerido)}</strong> cada una; el
                    precio de la suelta lo ponés vos.{' '}
                  </>
                )}
                {costoHeredado !== null && (
                  <>El costo lo toma del envase: {moneda.format(costoHeredado)}, y cambia solo cuando cambia el del envase.</>
                )}
              </p>
            )}
          </div>
        ) : buscando ? (
          <div className="relative">
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setBuscando(false)
              }}
              className={claseInput}
              placeholder="Buscá la caja o la bolsa por nombre o código"
            />
            {debounced.length > 1 && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-lg bg-white ring-1 ring-borde">
                {resultados.isPending && <p className="px-3 py-2 text-xs text-piedra-400">Buscando…</p>}
                {!resultados.isPending && !resultados.data?.length && (
                  <p className="px-3 py-2 text-xs text-piedra-400">Ningún producto con ese nombre o código.</p>
                )}
                {resultados.data?.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => elegir(r.id)}
                    className="block w-full border-b border-piedra-100 px-3 py-2 text-left last:border-0 hover:bg-marca-50"
                  >
                    <span className="block truncate text-sm text-tinta">{r.nombre_interno}</span>
                    <span className="font-mono text-xs text-piedra-400">{r.codigo}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setBuscando(false)} className={`${botonChico.suave} mt-1`}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-piedra-500">
              De ningún envase. Si es una pastilla, una tableta o un kilo suelto, elegí de qué caja o bolsa sale.
            </p>
            <button type="button" onClick={() => setBuscando(true)} className={botonChico.secundario}>
              Elegir el envase
            </button>
          </div>
        )}
      </div>

      {/* ¿En qué se abre éste? */}
      {productoId && (
        <div>
          <p className="mb-1 text-xs font-medium text-piedra-600">Se abre en</p>
          {suelta ? (
            <p className="text-sm text-tinta">
              {suelta.nombre_interno}
              <span className="ml-1 text-xs text-piedra-500">
                · trae {numero.format(suelta.cantidad_por_envase ?? 0)}
              </span>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-piedra-500">No se vende suelto.</p>
              {onCrearSuelta && (
                <button type="button" onClick={onCrearSuelta} className={botonChico.secundario}>
                  Crear la suelta
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
