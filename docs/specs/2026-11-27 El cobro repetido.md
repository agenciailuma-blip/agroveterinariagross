---
tags: [spec]
actualizado: 2026-11-27
---

# El cobro repetido

## Qué pasó

En la Caja 1 quedó «sin enviar» la venta MOS1-000228 con «La venta esta cobrada y no se puede
cobrar». La venta estaba bien: cobrada una vez, un pago, stock descontado una vez y factura con CAE.

El Mostrador 1 mandó el cobro dos veces a la vez (la subida de la cola se pedía desde varios lados
sin esperarse). Entró uno y el otro volvió rechazado; en ese instante la entrega a la caja se llevó
la copia, y la caja la reintentaba cada minuto.

## Qué se hace

1. `subirPendientes()` corre de a una por computadora, y al borrar una operación marca la siguiente
   en el mismo paso, para que la entrega a la caja no se lleve el resto de una venta que está
   subiendo.
2. `cobrar_venta()`: si la venta ya está cobrada y los pagos suman el total más la percepción
   anotada, contesta bien sin tocar nada. Si no suman eso, o está anulada, avisa como antes.

3. La base rechaza cualquier renglón, pago, lista o corrección de una venta cobrada, aunque ya
   lo tenga. La subida los saca de la cola si la venta está cobrada: renglones y lista, siempre;
   una corrección, si detrás viene su cobro; un pago, sólo si ese mismo ya está (si no, es otro
   cobro y sigue el aviso).

## Cómo se comprueba

- `app/src/lib/local/subida.prueba.ts`.
- `supabase/pruebas/cobro-repetido.sql` (deshace todo al terminar).
- En el local: la copia trabada de la Caja 1 sale sola en el reintento siguiente a la migración.
