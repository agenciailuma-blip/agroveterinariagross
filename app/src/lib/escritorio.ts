import type { Destino } from '@/lib/comprobante/destino'

/*
  Las dos formas en que corre el mismo sistema.

  En el navegador es una página web. En el mostrador va a ser un
  programa instalado en cada PC, que es lo que permite trabajar sin
  internet y hablarle a la impresora fiscal.

  Es la misma aplicación: casi nada cambia. Pero hay cosas que el
  navegador hace solo y adentro del programa hay que pedirlas, y este
  archivo es donde viven esas diferencias, para que no queden
  desparramadas por las pantallas.
*/

/**
 * Si estamos adentro del programa instalado.
 *
 * Tauri deja esta marca en la ventana al arrancar. Se lee así y no con
 * la librería de Tauri a propósito: preguntarlo tiene que funcionar
 * también en el navegador, donde esa librería no existe.
 */
export const enEscritorio =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/*
  Abrir el comprobante sin perder la cola de caja.

  En el navegador es una pestaña nueva. Adentro del programa, una
  pestaña no existe: Tauri bloquea `target="_blank"` y el botón no
  haría absolutamente nada, sin un error ni un aviso. Así que ahí se
  abre una ventana aparte.

  En las dos, lo importante es lo mismo: el cajero no pierde de vista la
  cola mientras entrega el comprobante.
*/
async function abrirDocumento(ruta: string, etiqueta: string, titulo: string): Promise<void> {
  if (!enEscritorio) {
    window.open(ruta, '_blank', 'noreferrer')
    return
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  // Si ya estaba abierta, se la trae al frente. Volver a crearla con la
  // misma etiqueta falla, y el cajero vería que el botón dejó de andar
  // justo la segunda vez que lo aprieta.
  const abierta = await WebviewWindow.getByLabel(etiqueta)
  if (abierta) {
    await abierta.setFocus()
    return
  }

  new WebviewWindow(etiqueta, {
    url: ruta,
    title: titulo,
    width: 900,
    height: 1000,
    center: true,
  })
}

export function abrirComprobante(comprobanteId: string): Promise<void> {
  return abrirDocumento(
    `/comprobante/${comprobanteId}`,
    `comprobante-${comprobanteId}`,
    'Comprobante',
  )
}

/*
  El presupuesto, el remito o el comprobante interno.

  Va por el mismo camino y con etiqueta propia: si compartieran etiqueta,
  abrir un remito traería al frente la factura que ya estaba abierta.
*/
export function abrirNoFiscal(id: string): Promise<void> {
  return abrirDocumento(`/no-fiscal/${id}`, `no-fiscal-${id}`, 'Comprobante no fiscal')
}

/*
  Qué impresoras tiene instaladas ESTA computadora.

  Se le pregunta a Windows en vez de escribir el nombre a mano porque los
  nombres reales no se adivinan: en la caja de Gross la POS80 se llama
  «POS80 Printer» y en los mostradores, la misma, «POS80 Printer(2)».

  Desde el navegador la lista viene vacía y no es un error: ninguna
  página web puede preguntarle al sistema qué impresoras hay. La pantalla
  lo explica en lugar de mostrar una falla.
*/
export async function listarImpresoras(): Promise<string[]> {
  if (!enEscritorio) return []
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string[]>('listar_impresoras')
}

/*
  Mandarle el ticket a la impresora del mostrador.

  Sólo existe adentro del programa instalado: una página web no puede
  mandarle bytes crudos a una impresora del local, y esa es justamente la
  razón principal por la que el sistema se empaqueta.

  Por dónde sale lo decide destinoDeImpresion(), no esta función: acá
  sólo se transporta lo que ya se decidió.
*/
export async function imprimirTicket(datos: Uint8Array, destino: Destino): Promise<void> {
  if (!enEscritorio) {
    throw new Error(
      'La impresión directa sólo funciona en el programa instalado. Desde el navegador, usá Imprimir.',
    )
  }
  const { invoke } = await import('@tauri-apps/api/core')
  // Se manda como lista de números: es lo que viaja bien entre la
  // ventana y el programa, sin que nadie tenga que interpretar nada.
  const bytes = Array.from(datos)

  if (destino.via === 'windows') {
    await invoke('imprimir_por_windows', { impresora: destino.impresora, datos: bytes })
    return
  }

  await invoke('imprimir_en_red', { host: destino.host, puerto: destino.puerto, datos: bytes })
}
