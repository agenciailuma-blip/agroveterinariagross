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
    da Windows. La misma POS80 se llama «POS80 Printer» en la caja y
    «POS80 Printer(2)» en los mostradores.

    Desde el 12/11 la manda la computadora y no el puesto: se guarda en
    la PC (ver impresoraDeEstaPc) y pisa a la que trae el servidor. Si
    dos PC quedaban como «Caja 1», cada una tomaba al arrancar la
    impresora que había elegido la otra.
  */
  impresora_windows: string | null
  /*
    Si esta máquina es la que escucha a las demás cuando no hay
    internet. Viaja con la terminal —y no en la configuración del
    comercio— porque es una propiedad de la máquina, igual que la
    impresora, y porque tiene que estar disponible sin conexión.
  */
  es_punto_de_encuentro: boolean
  /*
    De qué depósito sale lo que se vende acá. Nulo es el principal. Las
    pantallas lo usan para proponer el depósito de esta máquina —al
    contar, al recibir, al transferir— en vez de hacer elegirlo cada vez.
    Puede faltar en una terminal guardada por una versión anterior.
  */
  deposito_id?: string | null
}

const CLAVE = 'gross.terminal'
const CLAVE_IMPRESORA = 'gross.impresora_de_esta_pc'
const CLAVE_EQUIPO = 'gross.equipo'

/*
  La impresora de esta computadora, guardada en la computadora.

  null es «todavía no se eligió acá»: la primera vez se toma la que
  traía la terminal guardada, para que nadie la pierda al actualizar.
  Una cadena vacía es «elegida: ninguna».
*/
export function impresoraDeEstaPc(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(CLAVE_IMPRESORA)
}

/*
  Un identificador al azar de esta computadora, creado la primera vez.
  Sirve para darse cuenta de que dos PC eligieron el mismo puesto.
*/
export function equipoDeEstaPc(): string {
  if (typeof localStorage === 'undefined') return 'pruebas'
  let id = localStorage.getItem(CLAVE_EQUIPO)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLAVE_EQUIPO, id)
  }
  return id
}

/** La terminal con la impresora de esta PC encima de la que trae el servidor. */
export function conImpresoraDeEstaPc<T extends { impresora_windows: string | null }>(t: T, local: string | null): T {
  if (local === null) return t
  return { ...t, impresora_windows: local.trim() || null }
}

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
  // Fuera del navegador —en las pruebas— no hay dónde leer.
  if (typeof localStorage === 'undefined') return null
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

let actual: Terminal | null = (() => {
  const guardada = leerGuardada()
  return guardada ? conImpresoraDeEstaPc(guardada, impresoraDeEstaPc()) : null
})()
const oyentes = new Set<() => void>()

function publicar(t: Terminal | null) {
  if (t) {
    // La primera vez, la impresora que ya tenía esta PC pasa a ser suya.
    if (impresoraDeEstaPc() === null && actual?.impresora_windows) {
      localStorage.setItem(CLAVE_IMPRESORA, actual.impresora_windows)
    }
    t = conImpresoraDeEstaPc(t, impresoraDeEstaPc())
  }
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
  Qué queda guardado después de preguntarle al servidor.

  Una lista vacía no es «tu terminal ya no existe»: es una consulta que
  salió sin sesión —el servidor, por permisos, contesta que no hay
  ninguna— o una base sin terminales. Olvidarla ahí deja a la PC
  preguntando qué terminal es, y sin conexión no se puede elegir. Con la
  lista de verdad, la que se dio de baja sí se olvida: las demás siguen
  en la lista.
*/
export function revalidarTerminal(
  guardada: Terminal | null,
  lista: Terminal[],
): Terminal | null | 'sin_cambios' {
  if (!guardada || lista.length === 0) return 'sin_cambios'
  return lista.find((t) => t.id === guardada.id) ?? null
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
        .select('id, nombre, tipo, prefijo, punto_venta_id, impresora_windows, es_punto_de_encuentro, deposito_id')
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
      const revalidada = revalidarTerminal(actual, lista)
      if (revalidada !== 'sin_cambios') publicar(revalidada)
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

/*
  Elegir la impresora de esta computadora. Se guarda acá y se publica
  enseguida: el próximo ticket ya sale por la nueva.
*/
export function guardarImpresoraDeEstaPc(nombre: string) {
  localStorage.setItem(CLAVE_IMPRESORA, nombre.trim())
  if (actual) publicar(actual)
}
