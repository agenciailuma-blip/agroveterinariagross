/*
  ─────────────────────────────────────────────────────────────
  Por qué se rebajó un precio

  Pedido por Lucas el 07/09: el motivo del descuento tiene que salir
  de una lista, no escribirse.

  La razón de fondo no es la comodidad de no tipear. Un motivo
  escrito a mano no se puede contar: "vto proximo", "por vencer",
  "vence pronto" y "VENCIMIENTO" son cuatro cosas distintas para
  cualquier consulta. Con lista cerrada, en tres meses se puede
  responder cuánto se bonificó por vencimiento próximo, que es una
  pregunta de negocio real.

  Igual se puede escribir uno propio: la lista cubre lo de todos los
  días, y lo raro sigue teniendo dónde anotarse. Lo que se gana es
  que lo de todos los días caiga siempre en la misma palabra.

  Sumar un motivo es agregar un renglón acá. Cuando la lista se
  vuelva algo que Lucas quiera manejar sin llamarnos, se muda a
  `configuracion` — hoy sería adelantarse.
  ─────────────────────────────────────────────────────────────
*/
export const MOTIVOS_DE_PRECIO = [
  'Descuento por cantidad',
  'Vencimiento próximo',
  'Bonificación especial',
] as const

/*
  El redondeo de la caja es aparte: no es una decisión comercial
  sino la moneda que no existe. Va primero porque es el de todos los
  días.
*/
export const MOTIVOS_DE_AJUSTE = ['Redondeo al cliente', ...MOTIVOS_DE_PRECIO]
