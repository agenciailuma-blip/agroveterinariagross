import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { claveOrden, guardarOrden, leerOrden, ordenarFilas, siguienteOrden } from '@/lib/orden'
import type { Columnas, Orden } from '@/lib/orden'

/*
  El orden de una tabla, recordado por usuario.

  Uso en una pantalla:

    const orden = useOrden('remitos-logisticos', filas, {
      numero: (r) => r.numero,
      fecha: (r) => r.fecha,
      cliente: (r) => r.receptor_nombre,
    })
    …
    <EncabezadoOrdenable columna="numero" orden={orden}>Número</EncabezadoOrdenable>
    …
    {orden.filas.map(…)}

  El id de la tabla tiene que ser único en todo el sistema y no cambiar
  nunca: es la clave con la que se acuerda el orden de cada usuario.
*/
export interface EstadoDeOrden<T> {
  /** Las filas, ya ordenadas. */
  filas: T[]
  orden: Orden
  /** Toque en el encabezado de una columna. */
  alternar: (columna: string) => void
}

export function useOrden<T>(
  tablaId: string,
  filas: readonly T[] | undefined,
  columnas: Columnas<T>,
  /** Otros datos que usan las columnas (por ejemplo, una cuenta que llega aparte). */
  dependencias: readonly unknown[] = [],
): EstadoDeOrden<T> {
  const { perfil } = useAuth()
  const clave = claveOrden(perfil?.id, tablaId)

  const [estado, setEstado] = useState<{ clave: string; orden: Orden }>(() => ({ clave, orden: leerOrden(clave) }))

  // El perfil puede llegar después del primer dibujo: se relee con el usuario.
  useEffect(() => {
    if (estado.clave !== clave) setEstado({ clave, orden: leerOrden(clave) })
  }, [clave, estado.clave])

  const alternar = useCallback(
    (columna: string) => {
      setEstado((e) => {
        const orden = siguienteOrden(e.orden, columna)
        guardarOrden(clave, orden)
        return { clave, orden }
      })
    },
    [clave],
  )

  // Las funciones de las columnas se escriben en línea en cada pantalla;
  // el orden se recalcula cuando cambian las filas o el orden elegido.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ordenadas = useMemo(() => ordenarFilas(filas ?? [], estado.orden, columnas), [filas, estado.orden, ...dependencias])

  return { filas: ordenadas, orden: estado.orden, alternar }
}
