import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { comoTexto, listarStock, resumenStock } from '@/lib/api/stock'
import type { FiltroStock } from '@/lib/api/stock'
import { ESTADO_STOCK, moneda, numero } from '@/lib/tipos'

/*
  Stock — sugerencia 2 de Lucas.

  Hasta ahora el stock era una columna de Productos y un conteo en
  Inventario. Ninguna de las dos contesta la pregunta de todos los días,
  que es **qué hay que pedir**.

  Por eso esta pantalla arranca filtrada en lo que necesita una decisión
  y ordenada por urgencia, en vez de listar los 2.261 productos. Mirar
  el catálogo entero para encontrar los ocho que faltan es el trabajo
  que esta pantalla existe para sacar.
*/

const FILTROS: { valor: FiltroStock; etiqueta: string }[] = [
  { valor: 'atencion', etiqueta: 'Hay que mirarlos' },
  { valor: 'sobrevendido', etiqueta: 'Sobrevendidos' },
  { valor: 'critico', etiqueta: 'Críticos' },
  { valor: 'bajo', etiqueta: 'Stock bajo' },
  { valor: 'todos', etiqueta: 'Todos' },
]

export default function Stock() {
  const { tienePermiso } = useAuth()
  const [filtro, setFiltro] = useState<FiltroStock>('atencion')
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  const puedeVer = tienePermiso('stock.ver')

  const filas = useQuery({
    queryKey: ['stock', filtro, debounced],
    queryFn: () => listarStock(filtro, debounced),
    enabled: puedeVer,
  })

  const resumen = useQuery({
    queryKey: ['stock-resumen'],
    queryFn: resumenStock,
    enabled: puedeVer,
  })

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver el stock.
      </p>
    )
  }

  async function copiarLista() {
    if (!filas.data?.length) return
    try {
      await navigator.clipboard.writeText(comoTexto(filas.data))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // El portapapeles puede estar bloqueado. No es un error que valga
      // un cartel rojo: la lista está en pantalla y se puede leer.
      setCopiado(false)
    }
  }

  const r = resumen.data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Stock</h1>
          <p className="text-sm text-piedra-500">
            Qué hay que pedir. Ordenado por urgencia, no por nombre.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/inventario"
            className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta hover:bg-piedra-50"
          >
            Contar inventario
          </Link>
          <button
            onClick={copiarLista}
            disabled={!filas.data?.length}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {copiado ? 'Copiada' : 'Copiar la lista'}
          </button>
        </div>
      </div>

      {/*
        Los cuatro números de arriba. Se leen de un vistazo desde el
        mostrador y son el motivo para entrar a la pantalla: si están
        todos en cero, no hace falta mirar nada más.
      */}
      {r && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['sobrevendido', r.sobrevendido],
              ['critico', r.critico],
              ['bajo', r.bajo],
              ['ok', r.ok],
            ] as const
          ).map(([estado, n]) => (
            <button
              key={estado}
              onClick={() => setFiltro(estado === 'ok' ? 'todos' : estado)}
              className="rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-borde transition-colors hover:bg-piedra-50"
            >
              <p className="text-2xl font-semibold tabular-nums text-tinta">{numero.format(n)}</p>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ESTADO_STOCK[estado].clase}`}
              >
                {ESTADO_STOCK[estado].etiqueta}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-piedra-100 p-1">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filtro === f.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código o nombre"
          className="min-w-56 flex-1 rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-marca-500"
        />
      </div>

      {filas.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : !filas.data?.length ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12 text-center">
          <p className="text-sm text-piedra-500">
            {filtro === 'atencion'
              ? 'No hay nada por debajo del umbral. No hay nada que pedir.'
              : 'Ningún producto en este estado.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="py-2.5 text-right font-medium">Quedan</th>
                <th className="py-2.5 text-right font-medium">Avisa en</th>
                <th className="py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Reponer costaría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-100">
              {filas.data.map((f) => {
                const e = ESTADO_STOCK[f.estado]
                /*
                  Cuánto costaría llevarlo al umbral bajo. Es una cuenta
                  aproximada y a propósito: sirve para priorizar entre
                  veinte faltantes cuando la plata no alcanza para todos.
                  La sugerencia fina de reposición según venta histórica
                  es la 8, y quedó para V3.
                */
                const faltan = Math.max(0, f.umbral_bajo - f.cantidad)
                const costo = f.costo ? faltan * Number(f.costo) : null
                return (
                  <tr key={f.producto_id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-tinta">{f.nombre_interno}</p>
                      <p className="font-mono text-xs text-piedra-400">{f.codigo}</p>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-tinta">
                      {numero.format(f.cantidad)}
                      <span className="ml-1 text-xs text-piedra-400">{f.unidad_medida}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-piedra-500">
                      {numero.format(f.umbral_bajo)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${e.clase}`}
                      >
                        {e.etiqueta}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-piedra-600">
                      {costo === null ? (
                        <span className="text-xs text-piedra-300">sin costo cargado</span>
                      ) : (
                        <>
                          {moneda.format(costo)}
                          <span className="ml-1 text-xs text-piedra-400">
                            ({numero.format(faltan)})
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-piedra-400">
        El umbral de cada producto se configura en Productos, adentro de su ficha. Si no tiene uno
        propio, hereda el de su categoría o el general de Configuración.
      </p>
    </div>
  )
}
