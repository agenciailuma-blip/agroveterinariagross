---
tags: [spec]
actualizado: 2026-11-28
estado: hecho, falta publicar (0.27.8)
---

# Menos consultas al servidor y la factura web por mail

Dos arreglos, tamaño **grande** (base de datos, base local y mails). Aprobado y hecho el 28/11. La
función de los contadores del menú se llama `contadores_del_menu`.

## Por qué

- Registros: 2,01 de 1 GB. Transferencia: 5,58 de 5 GB (ciclo 12/11–12/12, compartidos con la tienda).
- Cada PC abierta hace unas 38 consultas por minuto aunque no haya cambiado nada: 31 de la
  sincronización, 4 de «¿hay conexión?» y 3 de los avisos del menú.
- La factura de un pedido web cobrado en la caja no sale por mail: sólo sale sola desde *Pedidos
  web* o a cuenta corriente.

## 1 · La factura web por mail (sólo base)

`mail_automatico_de_factura` suma un caso: si la venta de la factura (directa o por
`comprobante_venta`) es un pedido de la tienda con mail, devuelve ese mail.

- Siguen valiendo los frenos de hoy: envío prendido, con CAE, sólo facturas, nunca dos veces.
- La caja, Facturación, Por facturar y Proformas ya consultan esta función: **no hace falta
  versión nueva**, anda en todas las PC al aplicar la migración.
- *Pedidos web* no cambia (manda por su cuenta y no consulta la función: no se duplica).
- Sin conexión (CAEA) sigue sin mandarse, como hoy.
- Lo ya facturado no se manda solo; GR-MWZBZN03210 se manda con *Mandar por mail*.

## 2 · Preguntar una sola vez qué cambió (base y versión nueva)

| Hoy, por PC y por minuto | Después |
|---|---|
| 18 consultas, una por tabla, casi siempre vacías | 1: `que_cambio(cursores)` dice qué tablas tienen novedades y sólo ésas se bajan |
| 4 tablas fijas de ARCA | al abrir el programa y cada 6 horas |
| Cola de la caja y sus renglones | sólo si cambió (la misma consulta trae una huella) o si esta PC subió algo |
| 5 consultas de numeración | vienen en la misma respuesta |
| 1 de generación de la copia local | viene en la misma respuesta |
| 3 avisos del menú | 1 |
| 4 de «¿hay conexión?» | 2 (cada 30 segundos) — **a decidir** |
| 1 constancia de sincronización | igual: la tienda la usa para saber si el stock está fresco |

De unas 38 a unas 7 por minuto sin novedades.

### Lo que no cambia

- Se sincroniza cada 60 segundos, como hoy.
- La subida de ventas y cobros, la entrega a la caja por la red del local y el trabajo sin
  conexión no se tocan.
- La bajada de cada tabla es el mismo código (`recorrerPorFecha`, con su cuidado de los empates).
- `que_cambio` corre con los permisos de quien pregunta (`security invoker`): nadie ve más que hoy.
  Los avisos del menú devuelven cada número sólo a quien hoy lo ve.

### Cuidados

- Si `que_cambio` falla, esa vuelta se baja todo como antes: nunca se queda sin actualizar por
  culpa de la función nueva.
- Una tabla nueva en la sincronización que falte en la función se baja siempre (lo desconocido se
  trata como cambiado), y una prueba compara las dos listas.
- Las PC con la versión anterior siguen andando: las funciones son nuevas y no se saca ninguna.
- La huella de la cola incluye ventas y renglones: un cambio de precio tiene que llegar a la caja.

## Cuánto baja (estimado, a medir)

- Registros del ERP: **entre 70 y 80%** (de unos 3,7 GB por ciclo a entre 0,75 y 1,1). Entrar en
  1 GB entre los dos queda justo y puede no alcanzar.
- Transferencia del ERP: bastante, porque casi todo son respuestas vacías con sus encabezados.
  No hay número confiable hasta medir un día en el panel.
- **Esto solo no alcanza para el plan gratis:** la tienda sola va por unos 3,75 GB en medio ciclo.

## Cómo se verifica

1. Pruebas automáticas de qué se baja según la respuesta, incluido el fallo de la función.
2. Las dos migraciones probadas contra la base real en una transacción que se deshace (**pide OK**).
3. En el navegador contra la copia local: cambiar un precio y verlo llegar; una venta enviada a
   caja aparece; computadora y 375 px.
4. Después de publicar: contar en los registros las consultas por PC y mirar el panel al otro día.

## Orden

1. La factura por mail: migración, y queda andando.
2. Las funciones nuevas (migración) y después la versión, que publica Francisco desde la PC.

## Fuera de esto

El comprobante trabado por número repetido, los pedidos que la tienda consulta y no existen, y el
plan de Supabase.
