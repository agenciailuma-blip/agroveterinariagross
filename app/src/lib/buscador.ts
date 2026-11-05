import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

/*
  ─────────────────────────────────────────────────────────────
  Buscar con el teclado, como en el sistema anterior

  Pedido en la reunión del 05/11, mirando el mostrador en uso: el
  vendedor busca, recorre los resultados con las flechas, elige con
  Enter, y para buscar otra cosa aprieta directamente una letra o un
  número —sin volver al campo ni borrar lo anterior—. En el mostrador
  esos segundos son los que espera el cliente.

  Dos piezas:
  · La lista con flechas: el cursor se queda en el buscador y las
    flechas mueven una marca sobre los resultados. Enter elige el
    marcado. Si después de moverse se escribe, lo escrito reemplaza la
    búsqueda anterior.
  · Escribir sin volver al campo: una letra o un número apretado fuera
    de cualquier campo —sobre un botón, sobre la tabla— va al buscador,
    reemplazando lo que había. El lector de códigos también cae ahí.
  ─────────────────────────────────────────────────────────────
*/

/** La marca después de apretar una flecha. Da la vuelta en las puntas, como el sistema anterior. */
export function moverMarca(actual: number, total: number, tecla: 'ArrowDown' | 'ArrowUp'): number {
  if (total <= 0) return 0
  if (tecla === 'ArrowDown') return actual + 1 >= total ? 0 : actual + 1
  return actual - 1 < 0 ? total - 1 : actual - 1
}

/*
  El que tiene exactamente el código escrito va primero. El vendedor que
  sabe el código «1368» lo escribe y aprieta Enter: si la lista lo
  dejara abajo de «13680», Enter agregaría otro producto.
*/
export function primeroElCodigoExacto<T extends { codigo: string }>(items: readonly T[], texto: string): T[] {
  const buscado = texto.trim().toLowerCase()
  const i = items.findIndex((p) => p.codigo.trim().toLowerCase() === buscado)
  if (i <= 0) return [...items]
  return [items[i], ...items.slice(0, i), ...items.slice(i + 1)]
}

/** Una tecla que escribe un carácter: letra, número, espacio o signo. No las de función ni los atajos con Ctrl. */
export function esTeclaQueEscribe(e: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey
}

/** Donde una tecla ya escribe algo: ahí no hay que robársela. */
export function esCampoEditable(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color'].includes(el.type)
  }
  return el instanceof HTMLElement && el.isContentEditable
}

/*
  Una ventana abierta encima —la cantidad, el PIN, un cartel— es dueña
  del teclado: lo que se aprieta ahí no puede ir a parar al buscador de
  atrás. Las ventanas del sistema son `role="dialog"` o una capa
  `fixed inset-0` que tapa la pantalla.
*/
function hayVentanaAbierta(): boolean {
  return !!document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0')
}

/*
  La lista que se recorre con las flechas.

  Se le pasa la lista que se está mostrando y qué hacer al elegir. La
  marca vuelve al primero cada vez que cambian los resultados: una
  búsqueda nueva empieza arriba.

  `teclas` va en el `onKeyDown` del buscador y dice si atendió la
  tecla. La lista marca su renglón con `data-marcado`, y la marca se
  mantiene a la vista aunque la lista se desplace.
*/
export function useListaConFlechas<T>(items: readonly T[] | undefined, onElegir: (item: T) => void) {
  const [marcado, setMarcado] = useState(0)
  const lista = useRef<HTMLElement | null>(null)
  // Si se movió con las flechas, lo próximo que se escriba es una búsqueda nueva.
  const recorriendo = useRef(false)

  /*
    Vuelve arriba sólo si cambiaron los resultados, no si la lista se
    armó de nuevo con los mismos: una pantalla que la recalcula en cada
    dibujo dejaría la marca siempre en el primero.
  */
  const anteriores = useRef<readonly T[] | undefined>(undefined)
  useEffect(() => {
    const antes = anteriores.current
    anteriores.current = items
    const iguales = !!antes && !!items && antes.length === items.length && antes.every((x, i) => x === items[i])
    if (!iguales) setMarcado(0)
  }, [items])

  useEffect(() => {
    lista.current?.querySelector('[data-marcado="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [marcado])

  function teclas(e: KeyboardEvent<HTMLInputElement>): boolean {
    const total = items?.length ?? 0
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && total > 0) {
      e.preventDefault()
      recorriendo.current = true
      setMarcado((m) => moverMarca(Math.min(m, total - 1), total, e.key as 'ArrowDown' | 'ArrowUp'))
      return true
    }
    if (e.key === 'Enter' && total > 0 && items) {
      e.preventDefault()
      recorriendo.current = false
      onElegir(items[Math.min(marcado, total - 1)])
      return true
    }
    if (recorriendo.current && esTeclaQueEscribe(e)) {
      recorriendo.current = false
      e.currentTarget.select()
    }
    return false
  }

  return { marcado, setMarcado, teclas, lista }
}

/*
  Escribir sin volver al campo.

  Mientras la pantalla está a la vista, una tecla que escribe apretada
  fuera de un campo enfoca el buscador con todo seleccionado: el
  carácter reemplaza la búsqueda anterior. Funciona porque el navegador
  manda el carácter a donde está el foco al terminar la tecla, y el foco
  ya se movió.
*/
export function useEscribirEnElBuscador(buscador: RefObject<HTMLInputElement | null>, activo = true) {
  useEffect(() => {
    if (!activo) return
    function alTeclado(e: globalThis.KeyboardEvent) {
      const campo = buscador.current
      if (!campo || e.defaultPrevented || !esTeclaQueEscribe(e)) return
      // El espacio sobre un botón lo aprieta: es lo que se espera de él.
      if (e.key === ' ') return
      if (esCampoEditable(document.activeElement) || hayVentanaAbierta()) return
      campo.focus()
      campo.select()
    }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [buscador, activo])
}
