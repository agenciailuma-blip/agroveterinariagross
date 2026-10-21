import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { boton, botonChico, campo } from '@/estilos'
import {
  buscarFotos,
  consultaDe,
  filtrarPorNombre,
  FONDO_BLANCO,
  productosSinFoto,
  traerFoto,
  type FotoEncontrada,
  type ProductoSinFoto,
} from '@/lib/api/buscarFotos'
import { subirFoto } from '@/lib/api/imagenes'
import { enCastellano } from '@/lib/errores'
import { numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Buscar fotos en internet

  Para los productos que no tienen ninguna: de a cinco, el sistema busca
  y propone hasta cuatro por producto, las de fondo blanco primero.
  Lucas toca las que sirven —la primera que toca queda de principal— y
  guarda; lo que no eligió queda para otra vuelta. Primero salen los que
  se venden online.

  Cada búsqueda gasta una del buscador: se busca al mostrar la tanda, y
  otra vez sólo si Lucas cambia el texto y vuelve a buscar.
  ─────────────────────────────────────────────────────────────
*/

const TANDA = 5

interface Fila {
  producto: ProductoSinFoto
  consulta: string
  buscando: boolean
  fotos: FotoEncontrada[] | null
  error: string | null
  /** En el orden en que se tocaron: la primera queda de principal. */
  elegidas: string[]
  guardando: boolean
  guardadas: number
  errorAlGuardar: string | null
}

const filaDe = (p: ProductoSinFoto): Fila => ({
  producto: p,
  consulta: consultaDe(p),
  buscando: false,
  fotos: null,
  error: null,
  elegidas: [],
  guardando: false,
  guardadas: 0,
  errorAlGuardar: null,
})

export default function BuscarFotos({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient()
  const productos = useQuery({ queryKey: ['productos-sin-foto'], queryFn: productosSinFoto, staleTime: Infinity })
  const [desde, setDesde] = useState(0)
  const [filas, setFilas] = useState<Fila[]>([])
  const [guardando, setGuardando] = useState(false)
  const armada = useRef<string | null>(null)
  // Para trabajar por marca o por tipo: «ROYAL», «PIPETA».
  const [filtro, setFiltro] = useState('')
  const [aplicado, setAplicado] = useState('')

  const lista = useMemo(() => filtrarPorNombre(productos.data ?? [], aplicado), [productos.data, aplicado])
  const total = lista.length

  function cambiar(id: string, cambio: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.producto.id === id ? { ...f, ...cambio } : f)))
  }

  async function buscar(id: string, consulta: string) {
    cambiar(id, { buscando: true, error: null, fotos: null, elegidas: [] })
    try {
      cambiar(id, { fotos: await buscarFotos(consulta), buscando: false })
    } catch (e) {
      cambiar(id, { error: enCastellano(e), buscando: false })
    }
  }

  // Arma la tanda y la busca, de a dos a la vez.
  useEffect(() => {
    if (!productos.data || armada.current === `${aplicado}|${desde}`) return
    armada.current = `${aplicado}|${desde}`
    const tanda = lista.slice(desde, desde + TANDA).map(filaDe)
    setFilas(tanda)
    const pendientes = [...tanda]
    const trabajar = async () => {
      for (let f = pendientes.shift(); f; f = pendientes.shift()) await buscar(f.producto.id, f.consulta)
    }
    void Promise.all([trabajar(), trabajar()])
  }, [productos.data, lista, aplicado, desde])

  function tocar(id: string, url: string) {
    setFilas((fs) =>
      fs.map((f) =>
        f.producto.id !== id
          ? f
          : { ...f, elegidas: f.elegidas.includes(url) ? f.elegidas.filter((u) => u !== url) : [...f.elegidas, url] },
      ),
    )
  }

  const porGuardar = filas.filter((f) => f.elegidas.length > 0 && f.guardadas === 0)
  const elegidasEnTotal = porGuardar.reduce((s, f) => s + f.elegidas.length, 0)
  const ocupado = guardando || filas.some((f) => f.buscando)
  const hayMas = desde + TANDA < total

  async function guardarYSeguir() {
    setGuardando(true)
    let fallas = 0
    for (const f of porGuardar) {
      cambiar(f.producto.id, { guardando: true, errorAlGuardar: null })
      let guardadas = 0
      const errores: string[] = []
      for (const url of f.elegidas) {
        try {
          await subirFoto(f.producto.id, await traerFoto(url))
          guardadas++
        } catch (e) {
          errores.push(enCastellano(e))
        }
      }
      if (errores.length) fallas++
      cambiar(f.producto.id, { guardando: false, guardadas, errorAlGuardar: errores.length ? errores.join(' · ') : null })
    }
    setGuardando(false)
    qc.invalidateQueries({ queryKey: ['fotos'] })
    qc.invalidateQueries({ queryKey: ['tienda-listado'] })
    // Si algo falló, se queda para que Lucas vea qué y elija otra.
    if (fallas === 0 && hayMas) setDesde((d) => d + TANDA)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-2 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="buscar-fotos-titulo"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !guardando) onCerrar()
      }}
    >
      <div className="flex max-h-full w-full max-w-4xl min-w-0 flex-col gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-borde sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="buscar-fotos-titulo" className="font-semibold text-tinta">
            Buscar fotos en internet
          </h2>
          {total > 0 && (
            <span className="text-xs text-piedra-500">
              {numero.format(desde + 1)} a {numero.format(Math.min(desde + TANDA, total))} de {numero.format(total)} sin
              fotos
            </span>
          )}
        </div>
        <p className="-mt-1 text-sm text-piedra-600">
          Tocá las que sirven: la primera que tocás queda de principal. Las de fondo blanco van primero.
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setAplicado(filtro.trim())
            setDesde(0)
          }}
        >
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Sólo los que dicen… (por ejemplo ROYAL o PIPETA)"
            aria-label="Filtrar los productos por nombre o código"
            className={`${campo} min-w-0`}
            disabled={ocupado}
          />
          <button type="submit" disabled={ocupado} className={`${botonChico.secundario} shrink-0`}>
            Filtrar
          </button>
        </form>

        {productos.isPending && <p className="text-sm text-piedra-500">Buscando los productos sin fotos…</p>}
        {productos.isError && (
          <p className="text-sm text-red-700">No se pudo leer el catálogo: {enCastellano(productos.error)}</p>
        )}
        {productos.data && total === 0 && (
          <p className="text-sm text-piedra-600">
            {aplicado ? `Ningún producto sin fotos dice «${aplicado}».` : 'Todos los productos tienen foto.'}
          </p>
        )}

        <ul className="min-h-0 space-y-3 overflow-y-auto">
          {filas.map((f) => (
            <li key={f.producto.id} className="rounded-lg p-3 ring-1 ring-borde">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="min-w-0 font-medium break-words text-tinta">{f.producto.nombre}</span>
                <span className="font-mono text-xs text-piedra-500">{f.producto.codigo}</span>
                {f.producto.vende_online && (
                  <span className="rounded-full bg-verde-50 px-1.5 py-px text-[10px] font-semibold text-verde-700 uppercase ring-1 ring-verde-200">
                    Web
                  </span>
                )}
              </div>

              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void buscar(f.producto.id, f.consulta)
                }}
              >
                <input
                  value={f.consulta}
                  onChange={(e) => cambiar(f.producto.id, { consulta: e.target.value })}
                  aria-label={`Qué buscar para ${f.producto.nombre}`}
                  className={`${campo} min-w-0`}
                  disabled={f.guardadas > 0}
                />
                <button
                  type="submit"
                  disabled={f.buscando || guardando || f.guardadas > 0 || f.consulta.trim().length < 2}
                  className={`${botonChico.secundario} shrink-0`}
                >
                  Buscar
                </button>
              </form>

              {f.buscando && <p className="mt-2 text-xs text-piedra-500">Buscando…</p>}
              {f.error && <p className="mt-2 text-xs text-red-700">{f.error}</p>}
              {f.fotos && f.fotos.length === 0 && (
                <p className="mt-2 text-xs text-piedra-500">No encontró fotos. Probá con otras palabras.</p>
              )}

              {f.fotos && f.fotos.length > 0 && (
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {f.fotos.map((foto) => {
                    const lugar = f.elegidas.indexOf(foto.url)
                    return (
                      <li key={foto.url} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => tocar(f.producto.id, foto.url)}
                          disabled={guardando || f.guardadas > 0}
                          aria-pressed={lugar >= 0}
                          title={foto.titulo}
                          className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-white transition ${
                            lugar >= 0 ? 'ring-3 ring-marca-600' : 'ring-1 ring-borde hover:ring-marca-300'
                          }`}
                        >
                          <img src={foto.miniatura} alt={foto.titulo} className="size-full object-contain" />
                          {lugar >= 0 && (
                            <span className="absolute top-1 left-1 rounded-full bg-marca-700 px-1.5 py-px text-[10px] font-semibold text-white">
                              {lugar === 0 ? 'Principal' : `${lugar + 1}ª`}
                            </span>
                          )}
                          {(foto.blancura ?? 0) >= FONDO_BLANCO && (
                            <span className="absolute right-1 bottom-1 rounded-full bg-white/90 px-1.5 py-px text-[10px] text-piedra-600 ring-1 ring-borde">
                              Fondo blanco
                            </span>
                          )}
                        </button>
                        <p className="mt-0.5 truncate text-[11px] text-piedra-500" title={foto.sitio}>
                          {foto.sitio}
                          {foto.ancho && foto.alto ? ` · ${foto.ancho}×${foto.alto}` : ''}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}

              {f.guardando && <p className="mt-2 text-xs text-piedra-500">Guardando…</p>}
              {f.guardadas > 0 && (
                <p className="mt-2 text-xs text-verde-700">
                  {f.guardadas === 1 ? 'Guardada.' : `${f.guardadas} guardadas.`}
                </p>
              )}
              {f.errorAlGuardar && <p className="mt-2 text-xs text-red-700">{f.errorAlGuardar}</p>}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className={boton.suave}>
            Cerrar
          </button>
          {hayMas && (
            <button
              type="button"
              onClick={() => setDesde((d) => d + TANDA)}
              disabled={ocupado || productos.isPending}
              className={boton.secundario}
            >
              {elegidasEnTotal > 0 ? 'Saltear estos' : 'Los próximos'}
            </button>
          )}
          {elegidasEnTotal > 0 && (
            <button type="button" onClick={guardarYSeguir} disabled={ocupado} className={boton.principal}>
              {guardando
                ? 'Guardando…'
                : `Guardar ${numero.format(elegidasEnTotal)} ${elegidasEnTotal === 1 ? 'foto' : 'fotos'}${hayMas ? ' y seguir' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
