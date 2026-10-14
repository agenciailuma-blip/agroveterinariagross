import type { KeyboardEvent } from 'react'

/*
  ─────────────────────────────────────────────────────────────
  El Enter del teclado numérico pasa al campo siguiente

  En los formularios de carga, el Enter del teclado numérico hace lo que
  hacía en OBTech: lleva al campo que sigue, sin tocar el mouse. Se
  cargan los números con la mano derecha y se avanza con la misma mano.
  Pedido así el 05/10: el del teclado numérico, no el grande. El grande
  queda como estaba, y Tab sigue andando como en cualquier pantalla.

  Separarlos tiene además una ventaja: el lector de códigos manda el
  Enter grande después de cada código, así que nunca se confunde con el
  de avanzar.

  Va en cada formulario de carga y no en todo el sistema: en las
  ventanas que se aceptan con Enter, ese Enter tiene que seguir
  aceptando.

  Lo que se respeta:
  · Un campo que ya usa Enter para lo suyo —agregar un código de barra,
    crear una opción nueva— lo frena con preventDefault, y acá no se
    hace nada.
  · Un texto largo: Enter es un renglón nuevo.
  · Los botones se saltean. Llegar a uno con Enter y que el próximo
    Enter lo apriete —«Traer de ARCA», «Eliminar»— sería una sorpresa.
    Con Tab se llega igual.
  · En el último campo, Enter no hace nada: guardar sigue siendo una
    decisión.
  ─────────────────────────────────────────────────────────────
*/

const CAMPOS = 'input, select'

function esCampoQueAvanza(el: Element): el is HTMLInputElement | HTMLSelectElement {
  if (el instanceof HTMLSelectElement) return true
  if (!(el instanceof HTMLInputElement)) return false
  return !['button', 'submit', 'reset', 'file', 'hidden', 'image'].includes(el.type)
}

function sePuedeEnfocar(el: HTMLInputElement | HTMLSelectElement): boolean {
  if (el.disabled || el.tabIndex < 0) return false
  if (el instanceof HTMLInputElement && el.readOnly) return false
  // Oculto —un panel cerrado, una sección que no corresponde— no cuenta.
  return el.getClientRects().length > 0
}

export function avanzarConEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter' || e.nativeEvent.code !== 'NumpadEnter' || e.isDefaultPrevented()) return
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return

  const actual = e.target as Element
  if (!esCampoQueAvanza(actual)) return

  const campos = [...e.currentTarget.querySelectorAll(CAMPOS)]
    .filter(esCampoQueAvanza)
    .filter(sePuedeEnfocar)
  const i = campos.indexOf(actual)
  const siguiente = i >= 0 ? campos[i + 1] : undefined
  if (!siguiente) return

  e.preventDefault()
  siguiente.focus()
  // Escribir encima de lo que había, como en cualquier sistema de carga.
  if (siguiente instanceof HTMLInputElement && ['text', 'number', 'search', 'tel', 'email', 'url', ''].includes(siguiente.type)) {
    try {
      siguiente.select()
    } catch {
      // Algún tipo de campo no deja seleccionar: queda el cursor, alcanza.
    }
  }
}
