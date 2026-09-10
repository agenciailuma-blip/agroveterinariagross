/*
  Cómo se ven los botones, en un solo lugar.

  Existe porque ya se había roto. Las mismas clases estaban copiadas a
  mano en más de cuarenta lugares y, con el tiempo, tres se desviaron:
  "Nuevo producto" tenía el magenta al revés que los otros treinta y
  nueve, y "Importar planilla" y "Dados de baja" usaban el gris de
  Tailwind en vez del gris de la identidad de Gross. Se veían apagados al
  lado del resto, como si fueran menos importantes de lo que son.

  ─── LOS DOS GRISES, QUE ES DE DONDE VENÍA EL PROBLEMA ───

  Tailwind trae `slate`, que es un gris azulado. La identidad de Gross
  tiene el suyo —`piedra`, y `borde` para las líneas—, sacado del gris
  claro de la marca (#d1e2e8), que tira a verde. Puestos uno al lado del
  otro no se parecen. En este sistema el gris es `piedra`; `slate` no se
  usa.

  ─── LA JERARQUÍA ───

  · principal — la acción de la pantalla. Una sola por pantalla.
  · secundario — lo que también se puede hacer ahí, sin ser lo principal.
  · suave — lo que casi no se usa, o lo que se deshace.
  · peligro — lo que no se puede deshacer.
*/

const base = 'rounded-lg text-sm font-medium transition-colors disabled:opacity-40'

export const boton = {
  /** La acción de la pantalla. El magenta de la marca, #8d0b7b. */
  principal: `${base} bg-marca-700 px-4 py-2 text-white hover:bg-marca-600`,

  /** Lo que también se puede hacer acá. Mismo peso visual, sin el fondo. */
  secundario: `${base} px-4 py-2 text-marca-700 ring-1 ring-borde hover:bg-marca-50`,

  /** Lo de siempre-no: volver, cancelar, cerrar. */
  suave: `${base} px-4 py-2 text-piedra-600 hover:bg-piedra-100`,

  /** Lo que no se puede deshacer. */
  peligro: `${base} bg-red-600 px-4 py-2 text-white hover:bg-red-700`,
} as const

/*
  El mismo botón, más chico. Para las barras de acciones de una fila de
  tabla, donde el de tamaño normal empuja todo lo demás.
*/
export const botonChico = {
  principal: `${base} bg-marca-700 px-3 py-1.5 text-xs text-white hover:bg-marca-600`,
  secundario: `${base} px-3 py-1.5 text-xs text-marca-700 ring-1 ring-borde hover:bg-marca-50`,
  suave: `${base} px-3 py-1.5 text-xs text-piedra-500 hover:bg-piedra-100`,
} as const

/*
  Una barra de avance.

  Va del mismo color que el botón principal y no de un magenta más
  claro: las dos cosas dicen "esto es del sistema y está pasando ahora",
  y con dos tonos distintos parecían de familias distintas.
*/
export const barraDeAvance = {
  fondo: 'h-2 overflow-hidden rounded-full bg-piedra-200',
  relleno: 'h-full rounded-full bg-marca-700 transition-[width] duration-500',
} as const

/** El recuadro blanco sobre el que se apoya casi todo. */
export const tarjeta = 'rounded-xl bg-white shadow-sm ring-1 ring-borde'

/** Un campo de texto. */
export const campo =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'
