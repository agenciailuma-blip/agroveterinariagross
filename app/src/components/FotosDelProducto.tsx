import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar } from '@/components/Dialogo'
import { botonChico } from '@/estilos'
import { FOTOS_POR_PRODUCTO, fotosDe, ordenarFotos, quitarFoto, subirFoto } from '@/lib/api/imagenes'
import { enCastellano } from '@/lib/errores'

/*
  Las fotos del producto para la tienda online, en la ficha.

  La primera es la principal: la que la tienda muestra en la lista. Se
  suben de a varias, achicadas y en WebP (lib/api/imagenes.ts). Necesita
  internet: las fotos viven en el servidor, no en la copia local.
*/
export default function FotosDelProducto({ productoId }: { productoId: string }) {
  const { tienePermiso } = useAuth()
  const puedeEditar = tienePermiso('productos.editar')
  const qc = useQueryClient()
  const elegir = useRef<HTMLInputElement>(null)
  const [avance, setAvance] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fotos = useQuery({ queryKey: ['fotos', productoId], queryFn: () => fotosDe(productoId) })
  const lista = fotos.data ?? []
  const lugar = FOTOS_POR_PRODUCTO - lista.length

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['fotos', productoId] })
    qc.invalidateQueries({ queryKey: ['tienda-listado'] })
  }

  // De a una, en orden: así quedan en el orden en que se eligieron y el
  // avance dice algo cierto.
  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      const fallas: string[] = []
      for (const [i, archivo] of archivos.entries()) {
        setAvance(`Subiendo ${i + 1} de ${archivos.length}…`)
        try {
          await subirFoto(productoId, archivo)
        } catch (e) {
          fallas.push(`${archivo.name}: ${enCastellano(e)}`)
        }
      }
      return fallas
    },
    onSuccess: (fallas) => setError(fallas.length ? fallas.join(' · ') : null),
    onSettled: () => {
      setAvance(null)
      refrescar()
    },
  })

  const quitar = useMutation({
    mutationFn: (id: string) => quitarFoto(id),
    onSuccess: () => setError(null),
    onError: (e) => setError(enCastellano(e)),
    onSettled: refrescar,
  })

  const principal = useMutation({
    mutationFn: (id: string) => ordenarFotos(productoId, [id, ...lista.filter((f) => f.id !== id).map((f) => f.id)]),
    onSuccess: () => setError(null),
    onError: (e) => setError(enCastellano(e)),
    onSettled: refrescar,
  })

  const ocupado = subir.isPending || quitar.isPending || principal.isPending

  return (
    <div className="col-span-2 flex flex-col gap-3 sm:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-piedra-500">
          {lista.length} de {FOTOS_POR_PRODUCTO} fotos. La primera es la que se ve en la lista de la tienda. Se achican y
          se convierten a WebP solas.
        </p>
        {puedeEditar && (
          <>
            <input
              ref={elegir}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const archivos = [...(e.target.files ?? [])].slice(0, Math.max(0, lugar))
                e.target.value = ''
                if (archivos.length) subir.mutate(archivos)
              }}
            />
            <button
              type="button"
              onClick={() => elegir.current?.click()}
              disabled={ocupado || lugar <= 0}
              title={lugar <= 0 ? `Ya tiene ${FOTOS_POR_PRODUCTO} fotos: quitá alguna para sumar otra.` : undefined}
              className={botonChico.secundario}
            >
              {avance ?? 'Sumar fotos'}
            </button>
          </>
        )}
      </div>

      {fotos.isError && <p className="text-xs text-red-700">No se pudieron ver las fotos: {enCastellano(fotos.error)}</p>}

      {lista.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {lista.map((f, i) => (
            <li key={f.id} className="flex min-w-0 flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-piedra-50 ring-1 ring-borde">
                <img src={f.url} alt="" loading="lazy" className="size-full object-contain" />
                {i === 0 && (
                  <span className="absolute top-1 left-1 rounded-full bg-marca-700 px-1.5 py-px text-[10px] font-semibold text-white">
                    Principal
                  </span>
                )}
              </div>
              {puedeEditar && (
                <div className="flex flex-wrap gap-1">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => principal.mutate(f.id)}
                      disabled={ocupado}
                      className="text-[11px] font-medium text-marca-700 hover:underline disabled:opacity-40"
                    >
                      Hacer principal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const sigue = await confirmar({
                        titulo: '¿Quitar esta foto?',
                        detalle: 'Sale de la tienda en su próxima consulta. Se borra: para volver a ponerla hay que subirla de nuevo.',
                        aceptar: 'Quitar',
                        peligro: true,
                      })
                      if (sigue) quitar.mutate(f.id)
                    }}
                    disabled={ocupado}
                    className="text-[11px] text-piedra-500 hover:text-red-700 hover:underline disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
