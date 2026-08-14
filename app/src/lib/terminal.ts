import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface Terminal {
  id: string
  nombre: string
  tipo: 'caja' | 'mostrador' | 'oficina'
  prefijo: string | null
  punto_venta_id: string | null
}

const CLAVE = 'gross.terminal'

/*
  Qué terminal es esta máquina.

  Se elige una vez por PC y queda guardada localmente. No puede venir del
  usuario: el mismo vendedor atiende desde cualquiera de los mostradores,
  y lo que define el prefijo de numeración y la impresora es la máquina,
  no la persona.

  Se guarda la terminal ENTERA, no sólo su id. Sin conexión no se puede
  buscar el resto en el servidor, y una terminal a medias no sirve: sin
  prefijo no se puede numerar una venta.
*/
export function useTerminal() {
  const [terminal, setTerminalEstado] = useState<Terminal | null>(() => {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    try {
      const guardado = JSON.parse(crudo) as Terminal
      return guardado?.id ? guardado : null
    } catch {
      // Formato viejo: sólo el id. Se descarta y se vuelve a elegir.
      return null
    }
  })
  const [disponibles, setDisponibles] = useState<Terminal[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargar() {
      const { data, error } = await supabase
        .from('terminal')
        .select('id, nombre, tipo, prefijo, punto_venta_id')
        .eq('activo', true)
        .is('eliminado_en', null)
        .order('nombre')

      if (!vigente) return
      setCargando(false)

      // Sin respuesta del servidor no se toca nada de lo guardado. La
      // versión anterior borraba la terminal cuando la consulta fallaba,
      // así que un corte de internet hacía que la máquina se olvidara
      // cuál era y pidiera elegir de nuevo — justo cuando no puede.
      if (error || !data) return

      const lista = data as Terminal[]
      setDisponibles(lista)

      // Con respuesta buena sí se revalida: si la terminal se dio de
      // baja, hay que volver a elegir en vez de operar con una
      // referencia muerta. Y se refrescan sus datos por si cambiaron.
      setTerminalEstado((actual) => {
        if (!actual) return null
        const encontrada = lista.find((t) => t.id === actual.id)
        if (!encontrada) {
          localStorage.removeItem(CLAVE)
          return null
        }
        localStorage.setItem(CLAVE, JSON.stringify(encontrada))
        return encontrada
      })
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [])

  const elegir = useCallback((t: Terminal) => {
    localStorage.setItem(CLAVE, JSON.stringify(t))
    setTerminalEstado(t)
  }, [])

  const olvidar = useCallback(() => {
    localStorage.removeItem(CLAVE)
    setTerminalEstado(null)
  }, [])

  return { terminal, disponibles, cargando, elegir, olvidar }
}
