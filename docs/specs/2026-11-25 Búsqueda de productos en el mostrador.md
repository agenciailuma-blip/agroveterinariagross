---
tags: [spec, punto-de-venta]
estado: hecho (0.27.4)
---

# Búsqueda de productos en el mostrador

Pedido de Lucas (25/11, con captura buscando «trad»): no aparece el producto que busca y la
lista muestra pocos.

## Por qué pasa hoy

1. **Busca la frase entera, pegada.** «shampoo trad» sólo encuentra productos donde esas letras
   están juntas y en ese orden. Un doble espacio en el nombre («SHAMPOO  TRADIC») ya lo rompe:
   hay **370 productos activos** con espacios dobles en el nombre.
2. **Corta a los 20 primeros que encuentra, sin ordenar.** Los 20 salen en el orden interno de la
   base (al azar para el vendedor), no los que más se parecen. Con «sham» hay 29 productos: 9
   nunca aparecen, y cuáles quedan afuera depende de la suerte.
3. **«trad» trae «CASTRADOS» antes que «TRADIC»**: no hay preferencia por la palabra que empieza
   con lo escrito.

## Qué se hace

- **Por palabras, en cualquier orden:** cada palabra escrita tiene que estar en el código o el
  nombre (interno o público). «trad sham», «shampoo trad» y «sham   trad» encuentran
  «SHAMPOO TRADIC PULG». Los espacios dobles o de más dejan de importar.
- **Ordenado por parecido:** primero el código exacto (como hoy), después los que tienen palabras
  que *empiezan* con lo escrito, después el resto; a igual parecido, por nombre.
- **Hasta 40 resultados** en vez de 20 (Lucas pidió 30 o 40).
- Igual en el mostrador, en «agregar producto» del cobro y en el remito (usan la misma búsqueda),
  con y sin conexión. El lector de código de barra no cambia.

## Piezas

- `app/src/lib/busquedaProductos.ts` (nueva, pura y con pruebas): partir en palabras, coincidir y
  puntuar.
- `app/src/lib/local/consultas.ts`: `buscarProductosLocal` usa esa pieza (zona delicada: base
  local; sólo cambia la consulta, no la sincronización ni lo guardado).
- `app/src/lib/api/ventas.ts`: la búsqueda del servidor (primer arranque) también por palabras y
  hasta 40.
- Sin cambios en la base de datos.
