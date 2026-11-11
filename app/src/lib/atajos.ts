import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/*
  ─────────────────────────────────────────────────────────────
  Los atajos de teclado

  Todos definidos acá, en un solo lugar: lo que muestra la ayuda (F1) y
  la lista de Configuración sale de esta misma tabla, así lo que se lee
  y lo que hace el teclado no pueden quedar distintos.

  Las teclas de función, como en los sistemas de mostrador de siempre:
  no escriben nada, así que andan aunque el cursor esté en un campo, y
  no chocan con el lector de códigos, que manda números y Enter.

  Una regla para no tener que memorizar mucho: F10 hace lo principal de
  la pantalla —enviar a caja, cobrar, guardar, aceptar—. Si el botón
  está apagado, F10 tampoco hace nada.

  Propuesta del 05/10, para que Lucas la revise. Era F9; el 05/11 pasó
  a F10 porque en el sistema anterior F10 es «Aceptar» en todas las
  pantallas y el local ya lo tiene en los dedos. Cambiar una tecla es
  cambiar esta tabla.
  ─────────────────────────────────────────────────────────────
*/

export interface Atajo {
  teclas: string
  que: string
}

export const ATAJOS: { donde: string; atajos: Atajo[] }[] = [
  {
    donde: 'En cualquier pantalla',
    atajos: [
      { teclas: 'F1', que: 'Ver esta lista de atajos' },
      { teclas: 'F2', que: 'Ir al Mostrador, con el cursor en el buscador de productos' },
      { teclas: 'F4', que: 'Ir a la Caja' },
      { teclas: 'F6', que: 'Ir a Clientes' },
      { teclas: 'F7', que: 'Ir a Productos' },
      { teclas: 'F8', que: 'Ir a Stock' },
      { teclas: 'F10', que: 'Lo principal de la pantalla: enviar a caja, cobrar, guardar o aceptar' },
      { teclas: 'Esc', que: 'Cerrar la ventana abierta, o cancelar' },
    ],
  },
  {
    donde: 'En el Mostrador',
    atajos: [
      { teclas: 'F2', que: 'Volver al buscador de productos' },
      { teclas: 'F3', que: 'Elegir el cliente' },
      { teclas: 'F11', que: 'Asociar productos: que la factura los muestre bajo un concepto' },
      { teclas: 'F10', que: 'Cobrar ahí mismo, para quien cobra. Para quien no cobra: enviar a caja (otra vez F10 la manda sin nombre)' },
      { teclas: 'F9', que: 'Enviar a caja, para quien cobra' },
    ],
  },
  {
    donde: 'En la Caja',
    atajos: [
      { teclas: 'F3', que: 'Pasar a la próxima venta de la cola' },
      { teclas: 'F10', que: 'Cobrar' },
    ],
  },
  {
    donde: 'Al cobrar, en la Caja o en el Mostrador',
    atajos: [
      { teclas: 'F9', que: 'Con factura' },
      { teclas: 'F11', que: 'Sin factura' },
      { teclas: 'F10', que: 'Cobrar' },
    ],
  },
  {
    donde: 'En los formularios de carga',
    atajos: [
      { teclas: 'Enter del teclado numérico', que: 'Pasar al campo siguiente' },
      { teclas: 'Tab · Mayús + Tab', que: 'Campo siguiente · campo anterior' },
      { teclas: 'F10', que: 'Guardar' },
    ],
  },
]

/** Adónde lleva cada tecla desde cualquier pantalla, si la persona puede entrar ahí. */
export const IR_A: { tecla: string; a: string; permiso: string }[] = [
  { tecla: 'F2', a: '/ventas', permiso: 'ventas.crear' },
  { tecla: 'F4', a: '/caja', permiso: 'ventas.cobrar' },
  { tecla: 'F6', a: '/clientes', permiso: 'clientes.ver' },
  { tecla: 'F7', a: '/productos', permiso: 'productos.ver' },
  { tecla: 'F8', a: '/stock', permiso: 'stock.ver' },
]

/*
  Los de cada pantalla, en una pila.

  Gana el último que se registró: una ventana que se abre encima de la
  pantalla se queda con F10 mientras está abierta —aceptar la pregunta,
  no volver a apretar el botón de atrás— y al cerrarse se lo devuelve.
*/
const pila: { tecla: string; accion: () => void }[] = []

export function atajoDePantalla(tecla: string): (() => void) | null {
  for (let i = pila.length - 1; i >= 0; i--) if (pila[i].tecla === tecla) return pila[i].accion
  return null
}

/** Que la tecla haga esto mientras el componente está a la vista. */
export function useAtajo(tecla: string, accion: () => void, activo = true) {
  const actual = useRef(accion)
  useEffect(() => {
    actual.current = accion
  })
  useEffect(() => {
    if (!activo) return
    const entrada = { tecla, accion: () => actual.current() }
    pila.push(entrada)
    return () => {
      const i = pila.indexOf(entrada)
      if (i >= 0) pila.splice(i, 1)
    }
  }, [tecla, activo])
}

/*
  Esc cierra la ventana.

  No alcanza con escucharlo en la ventana misma: cuando desaparece lo que
  tenía el cursor —un formulario que se cerró, un botón que se apagó— el
  cursor vuelve al fondo de la página y la tecla ya no pasa por la
  ventana. Visto el 05/11 en Ingresos y egresos: el segundo Esc no hacía
  nada. Se escucha en toda la página, salvo que la tecla venga de otra
  ventana encima (una pregunta de confirmar), que se cierra sola.
*/
export function useEscapeCierra(ventana: RefObject<HTMLElement | null>, accion: () => void, activo = true) {
  const actual = useRef(accion)
  useEffect(() => {
    actual.current = accion
  })
  useEffect(() => {
    if (!activo) return
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const desde = e.target instanceof Node ? e.target : null
      const enOtraVentana = desde && desde !== document.body && !ventana.current?.contains(desde)
      if (enOtraVentana) return
      actual.current()
    }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [ventana, activo])
}

/*
  Que la tecla apriete este botón.

  Aprieta el botón de verdad, así respeta todo lo que el botón ya sabe:
  si está apagado porque falta un dato o porque ya se está guardando,
  la tecla tampoco hace nada.
*/
export function useBotonConAtajo(tecla: string) {
  const boton = useRef<HTMLButtonElement>(null)
  useAtajo(tecla, () => {
    if (boton.current && !boton.current.disabled) boton.current.click()
  })
  return boton
}
