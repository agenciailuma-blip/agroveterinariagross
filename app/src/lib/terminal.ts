import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

export interface Terminal {
  id: string
  nombre: string
  tipo: 'caja' | 'mostrador' | 'oficina'
  prefijo: string | null
  punto_venta_id: string | null
  /*
    La impresora de tickets de ESTA máquina, con el nombre exacto que le
    da Windows. Viaja con la terminal —y no en la configuración del
    comercio— porque la misma POS80 se llama «POS80 Printer» en la caja y
    «POS80 Printer(2)» en los mostradores.
  */
  impresora_windows: string | null
  /*
    Si esta máquina es la que escucha a las demás cuando no hay
    internet. Viaja con la terminal —y no en la configuración del
    comercio— porque es una propiedad de la máquina, igual que la
    impresora, y porque tiene que estar disponible sin conexión.
  */
  es_punto_de_encuentro: boolean
}

const CLAVE = 'gross.terminal'

/*
  ─────────────────────────────────────────────────────────────
  La terminal es UNA SOLA para toda la aplicación

  Antes cada componente que preguntaba «qué terminal soy» se guardaba su
  propia copia. Elegirla en Ventas actualizaba la de esa pantalla, y la
  del motor de sincronización seguía en null hasta reiniciar el programa.

  Eso rompía justo el día de la instalación: en una PC nueva se elige la
  terminal y se empieza a trabajar, y como el motor no se enteraba, NO
  ALINEABA LA NUMERACIÓN con la del servidor. El primer comprobante salía
  con el número uno, que ya estaba usado, y la operación no podía subir.

  Ahora el valor vive en un solo lugar y todos los componentes lo miran.
  Se descubrió el 07/09 probando la emisión sin conexión.
  ─────────────────────────────────────────────────────────────
*/
function leerGuardada(): Terminal | null {
  const crudo = localStorage.getItem(CLAVE)
  if (!crudo) return null
  try {
    const guardado = JSON.parse(crudo) as Terminal
    return guardado?.id ? guardado : null
  } catch {
    // Formato viejo: sólo el id. Se descarta y se vuelve a elegir.
    return null
  }
}

let actual: Terminal | null = leerGuardada()
const oyentes = new Set<() => void>()

function publicar(t: Terminal | null) {
  actual = t
  if (t) localStorage.setItem(CLAVE, JSON.stringify(t))
  else localStorage.removeItem(CLAVE)
  for (const avisar of oyentes) avisar()
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  return () => {
    oyentes.delete(avisar)
  }
}

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
  const terminal = useSyncExternalStore(suscribir, () => actual)
  const [disponibles, setDisponibles] = useState<Terminal[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargar() {
      const { data, error } = await supabase
        .from('terminal')
        .select('id, nombre, tipo, prefijo, punto_venta_id, impresora_windows, es_punto_de_encuentro')
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
      if (actual) {
        const encontrada = lista.find((t) => t.id === actual!.id)
        publicar(encontrada ?? null)
      }
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [])

  const elegir = useCallback((t: Terminal) => publicar(t), [])
  const olvidar = useCallback(() => publicar(null), [])

  return { terminal, disponibles, cargando, elegir, olvidar }
}
