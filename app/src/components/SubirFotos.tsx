import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { boton } from '@/estilos'
import { emparejarArchivos, productosParaFotos, subirFoto } from '@/lib/api/imagenes'
import { enCastellano } from '@/lib/errores'
import { numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Subir fotos de a muchas

  Para la carga inicial de la tienda: cientos de fotos sin abrir ficha
  por ficha. Cada archivo se nombra con el código del producto o su
  código de barras —«DEMO-002.jpg», «7790000000002.png»—, y para más de
  una foto del mismo producto se le agrega un número: «DEMO-002-2.jpg».

  Antes de subir se muestra a qué producto va cada una: una foto en el
  producto equivocado sale en la tienda con el nombre de otro. Lo que no
  coincide se dice y no se sube.
  ─────────────────────────────────────────────────────────────
*/

type Resultado = 'subida' | string

export default function SubirFotos({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient()
  const elegir = useRef<HTMLInputElement>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [resultados, setResultados] = useState<Map<string, Resultado>>(new Map())
  const [subiendo, setSubiendo] = useState<string | null>(null)

  const productos = useQuery({ queryKey: ['productos-para-fotos'], queryFn: productosParaFotos })

  const emparejados = useMemo(
    () => (productos.data ? emparejarArchivos(archivos.map((a) => a.name), productos.data) : []),
    [archivos, productos.data],
  )
  const paraSubir = emparejados.filter((e) => e.producto && resultados.get(e.archivo) !== 'subida')
  const sinProducto = emparejados.filter((e) => !e.producto)
  const subidas = [...resultados.values()].filter((r) => r === 'subida').length

  async function subirTodas() {
    const porNombre = new Map(archivos.map((a) => [a.name, a]))
    const nuevos = new Map(resultados)
    for (const [i, e] of paraSubir.entries()) {
      setSubiendo(`Subiendo ${numero.format(i + 1)} de ${numero.format(paraSubir.length)}…`)
      try {
        await subirFoto(e.producto!.id, porNombre.get(e.archivo)!)
        nuevos.set(e.archivo, 'subida')
      } catch (error) {
        nuevos.set(e.archivo, enCastellano(error))
      }
      setResultados(new Map(nuevos))
    }
    setSubiendo(null)
    qc.invalidateQueries({ queryKey: ['fotos'] })
    qc.invalidateQueries({ queryKey: ['tienda-listado'] })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subir-fotos-titulo"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !subiendo) onCerrar()
      }}
    >
      <div className="flex max-h-full w-full max-w-2xl min-w-0 flex-col gap-4 rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <div>
          <h2 id="subir-fotos-titulo" className="font-semibold text-tinta">
            Subir fotos de a muchas
          </h2>
          <p className="mt-1 text-sm text-piedra-600">
            Nombrá cada foto con el código del producto o su código de barras, por ejemplo «DEMO-002.jpg». Para más
            de una del mismo producto, agregale un número: «DEMO-002-2.jpg». Se achican y se convierten a WebP solas.
          </p>
        </div>

        <input
          ref={elegir}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            setArchivos([...(e.target.files ?? [])])
            setResultados(new Map())
            e.target.value = ''
          }}
        />

        {archivos.length === 0 ? (
          <button
            type="button"
            onClick={() => elegir.current?.click()}
            disabled={!productos.data}
            className={`${boton.secundario} self-start`}
          >
            {productos.isPending ? 'Preparando…' : 'Elegir fotos'}
          </button>
        ) : (
          <>
            <p className="text-sm text-tinta">
              <strong>{numero.format(emparejados.length - sinProducto.length)}</strong> van a su producto
              {sinProducto.length > 0 && (
                <>
                  {' · '}
                  <strong className="text-amber-800">{numero.format(sinProducto.length)}</strong> sin producto: no se
                  suben
                </>
              )}
              {subidas > 0 && (
                <>
                  {' · '}
                  <strong className="text-verde-700">{numero.format(subidas)}</strong> subidas
                </>
              )}
            </p>

            <div className="min-h-0 overflow-y-auto rounded-lg ring-1 ring-borde">
              <ul className="divide-y divide-piedra-100 text-sm">
                {emparejados.map((e) => {
                  const r = resultados.get(e.archivo)
                  return (
                    <li key={e.archivo} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                      <span className="min-w-0 break-all font-mono text-xs text-piedra-500">{e.archivo}</span>
                      <span className="min-w-0 text-right">
                        {e.producto ? (
                          <span className="text-tinta">
                            {e.producto.codigo} · {e.producto.nombre}
                          </span>
                        ) : (
                          <span className="text-amber-800">No hay ningún producto «{e.clave}»</span>
                        )}
                        {r === 'subida' && <span className="ml-2 text-verde-700">Subida</span>}
                        {r && r !== 'subida' && <span className="block text-xs text-red-700">{r}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}

        {productos.isError && (
          <p className="text-sm text-red-700">No se pudo leer el catálogo: {enCastellano(productos.error)}</p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {archivos.length > 0 && !subiendo && (
            <button type="button" onClick={() => elegir.current?.click()} className={boton.suave}>
              Elegir otras
            </button>
          )}
          <button type="button" onClick={onCerrar} disabled={!!subiendo} className={boton.suave}>
            {subidas > 0 && paraSubir.length === 0 ? 'Listo' : 'Cerrar'}
          </button>
          {paraSubir.length > 0 && (
            <button type="button" onClick={subirTodas} disabled={!!subiendo} className={boton.principal}>
              {subiendo ?? `Subir ${numero.format(paraSubir.length)} ${paraSubir.length === 1 ? 'foto' : 'fotos'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
