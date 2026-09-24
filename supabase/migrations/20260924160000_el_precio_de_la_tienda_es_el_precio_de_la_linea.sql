-- ═══════════════════════════════════════════════════════════════
-- EL PRECIO DE LA TIENDA ES EL PRECIO DE LA LÍNEA
--
-- Lo encontró la prueba: un pedido con un precio distinto del que tiene
-- el sistema no entraba. La base exige que una línea con precio
-- distinto del de lista diga quién lo cambió y por qué —la regla de
-- V1-A para el precio tocado a mano en el mostrador— y en un pedido web
-- no hay ningún quién.
--
-- La regla que sale de ahí: en una venta de la tienda, el precio de
-- lista de la línea ES el que la tienda publicó y el cliente pagó. La
-- diferencia contra el precio del sistema no se pierde: queda anotada
-- en el pedido, que es donde alguien la va a mirar antes de facturar.
--
-- Y de paso: un pedido de total cero no registra cobro, porque la base
-- no admite un pago de cero.
--
-- La función se reescribe entera, con esos dos cambios.
-- ═══════════════════════════════════════════════════════════════
do $$
declare d text;
begin
  /*
    Se reescribe a partir de su propia definición, cambiando sólo las
    dos líneas que cambian. En una base nueva, la función viene de la
    migración anterior y acá se la corrige: el resultado es el mismo que
    en la base de producción, sin que una diferencia de tipeo las separe.
  */
  d := pg_get_functiondef('app.registrar_pedido_de_la_tienda(uuid,jsonb)'::regprocedure);

  if position('coalesce((v_del_canal ->> ''precio'')::numeric, v_precio), v_precio, v_precio,' in d) = 0
     and position('v_precio, v_precio, v_precio,' in d) = 0 then
    raise exception 'No se encontró la línea del precio: la función cambió y esta migración hay que revisarla.';
  end if;
  d := replace(d,
    'coalesce((v_del_canal ->> ''precio'')::numeric, v_precio), v_precio, v_precio,',
    'v_precio, v_precio, v_precio,');

  if position('if v_pagado then' in d) = 0 and position('if v_pagado and v_total > 0 then' in d) = 0 then
    raise exception 'No se encontró el cobro: la función cambió y esta migración hay que revisarla.';
  end if;
  d := replace(d, 'if v_pagado then', 'if v_pagado and v_total > 0 then');

  execute d;
end $$;

comment on function app.registrar_pedido_de_la_tienda(uuid, jsonb) is
  'Convierte un pedido de la tienda en una venta del sistema. El precio que informa la tienda es el precio de la línea. No factura: eso lo decide una persona desde Pedidos.';
