-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA API DE LA TIENDA, CONTRA LA BASE REAL
--
-- Cómo se corre: se pega entero en el editor SQL de Supabase (o por el
-- conector, verificando antes que apunte a ywggnhoifhtoncnxrodh).
--
-- Termina SIEMPRE con un error, a propósito: es lo que deshace todo lo
-- que se creó para probar —productos, claves, listas— sin dejar nada.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Para romper el código a propósito: se pega ANTES de este archivo un
-- create or replace de la función rota. Como todo corre en la misma
-- transacción, la función rota también se deshace al terminar.
--
-- Lo que esto no puede probar es la marca de agua con dos sesiones a la
-- vez —acá todo pasa dentro de una sola—. Esa se prueba aparte, con el
-- procedimiento que está al final del archivo.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALLA: %', p_que;
  end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.producto_en(p_respuesta json, p_id uuid)
returns json language sql as $$
  select e from json_array_elements(p_respuesta -> 'productos') e where e ->> 'id' = p_id::text
$$;

create function pg_temp.claves(p json)
returns text language sql as $$
  select string_agg(k, ',' order by k) from json_object_keys(p) k
$$;

do $$
declare
  v_canal     uuid;
  v_contado   uuid;
  v_lista     uuid;
  v_a         uuid;
  v_b         uuid;
  v_c         uuid;
  v_fito      uuid;
  v_sin_nom   uuid;
  v_sin_prec  uuid;
  v_r         json;
  v_p         json;
  v_texto     text;
  v_marca     text;
  v_hay_mas   boolean;
  v_vistos    uuid[] := '{}';
  v_paginas   integer := 0;
  v_clave     text;
  v_real      uuid[];
  v_con_animal uuid;
  v_hasta     timestamptz := now() + interval '1 second';
  v_campos    constant text :=
    'actualizado_en,animales,categoria,codigo,codigos_barra,descripcion,etapas_de_vida,id,marca,nombre,precio,presentacion,publicado,requiere_receta,stock,unidad';
begin
  select id into v_canal from public.canal where tipo = 'tienda' and activo and eliminado_en is null;
  select lista_precio_id into v_contado from public.canal where id = v_canal;
  perform pg_temp.comprobar(v_canal is not null, 'no hay canal de tienda activo');
  perform pg_temp.comprobar(v_contado is not null, 'el canal de la tienda no tiene lista de precios');

  -- ─── Datos de prueba ───
  insert into public.producto (codigo, nombre_interno, nombre_publico, descripcion, precio_venta, costo, margen_sobre_costo,
                               categoria_id, marca_id, presentacion_id)
  values ('PRUEBA-API-A', 'PRUEBA INTERNO ZZQ', '  Producto de prueba A  ', 'Para probar la API', 10000, 4321.09, 55,
          (select id from public.categoria where slug = 'alimentos'),
          (select id from public.marca where slug = 'pro-plan'),
          (select id from public.presentacion where slug = 'bolsa'))
  returning id into v_a;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
  values ('PRUEBA-API-B', 'PRUEBA B', 'Producto de prueba B', 2000) returning id into v_b;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
  values ('PRUEBA-API-C', 'PRUEBA C', 'Producto de prueba C', 3000) returning id into v_c;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta, es_fitosanitario)
  values ('PRUEBA-API-F', 'PRUEBA F', 'Herbicida de prueba', 5000, true) returning id into v_fito;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
  values ('PRUEBA-API-N', 'PRUEBA N', '   ', 5000) returning id into v_sin_nom;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
  values ('PRUEBA-API-Z', 'PRUEBA Z', 'Sin precio de prueba', 0) returning id into v_sin_prec;

  insert into public.producto_animal (producto_id, animal_id)
    values (v_a, (select id from public.animal where slug = 'perros'));
  insert into public.producto_etapa_vida (producto_id, etapa_vida_id)
    values (v_a, (select id from public.etapa_vida where slug = 'adulto'));
  insert into public.producto_codigo_barra (producto_id, codigo, es_principal)
    values (v_a, '7790000999991', true);
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo)
    values (v_a, 'carga_inicial', 5, 'Prueba de la API', 'manual'),
           (v_b, 'carga_inicial', 1, 'Prueba de la API', 'manual');

  -- ─── 1. Sin el interruptor, no sale ───
  v_r := app.catalogo_de_canal(v_canal, null, 1000, v_hasta);
  perform pg_temp.comprobar(pg_temp.producto_en(v_r, v_a) is null,
    'un producto sin "Vender online" salió en el catálogo');
  perform pg_temp.comprobar(
    (select motivo from app.productos_de_canal(v_canal) where producto_id = v_a) = 'No está marcado para vender online',
    'el motivo de un producto apagado no es el esperado');

  -- ─── 2. Prendido, sale, con el colchón descontado ───
  insert into public.canal_producto (canal_id, producto_id)
  select v_canal, x from unnest(array[v_a, v_b, v_c, v_fito, v_sin_nom, v_sin_prec]) x;

  v_r := app.catalogo_de_canal(v_canal, null, 1000, v_hasta);
  v_p := pg_temp.producto_en(v_r, v_a);
  perform pg_temp.comprobar(v_p is not null, 'un producto prendido y completo no salió');
  perform pg_temp.comprobar((v_p ->> 'stock')::numeric = 3,
    format('hay 5 y el colchón del canal es 2: la tienda tenía que ver 3 y vio %s', v_p ->> 'stock'));
  perform pg_temp.comprobar((pg_temp.producto_en(v_r, v_c) ->> 'stock')::numeric = 0,
    'un producto sin stock no salió con stock 0');
  perform pg_temp.comprobar((pg_temp.producto_en(v_r, v_b) ->> 'stock')::numeric = 0,
    'con 1 y colchón 2, el stock tiene que ser 0, nunca negativo');

  -- ─── 3. La lista de campos es cerrada ───
  perform pg_temp.comprobar(pg_temp.claves(v_p) = v_campos,
    format('los campos del producto cambiaron: %s', pg_temp.claves(v_p)));
  perform pg_temp.comprobar(pg_temp.claves(v_r) = 'canal,frescura,generado_en,hay_mas,productos,siguiente',
    format('los campos de la respuesta cambiaron: %s', pg_temp.claves(v_r)));
  v_texto := v_r::text;
  perform pg_temp.comprobar(position('4321.09' in v_texto) = 0, 'el costo aparece en la respuesta');
  perform pg_temp.comprobar(position('PRUEBA INTERNO ZZQ' in v_texto) = 0, 'el nombre interno aparece en la respuesta');
  perform pg_temp.comprobar(position('colchon' in v_texto) = 0, 'el colchón aparece en la respuesta');

  -- ─── 4. Lo que sale de cada campo ───
  perform pg_temp.comprobar(v_p ->> 'nombre' = 'Producto de prueba A', 'el nombre no es el público, sin espacios de más');
  perform pg_temp.comprobar((v_p ->> 'precio')::numeric = 10000, 'el precio con la lista de contado no es el de la ficha');
  perform pg_temp.comprobar(v_p ->> 'categoria' = 'alimentos' and v_p ->> 'marca' = 'pro-plan'
                            and v_p ->> 'presentacion' = 'bolsa', 'las clasificaciones no salen con su slug');
  perform pg_temp.comprobar((v_p -> 'animales')::text = '["perros"]' and (v_p -> 'etapas_de_vida')::text = '["adulto"]',
    'animales o etapas de vida no salen como se cargaron');
  perform pg_temp.comprobar((v_p -> 'codigos_barra')::text = '["7790000999991"]', 'los códigos de barra no salen');
  perform pg_temp.comprobar((v_p ->> 'publicado')::boolean, 'un producto publicado no dice publicado: true');

  -- ─── 5. El colchón del producto le gana al del canal ───
  update public.canal_producto set colchon = 4 where canal_id = v_canal and producto_id = v_a;
  v_p := pg_temp.producto_en(app.catalogo_de_canal(v_canal, null, 1000, v_hasta), v_a);
  perform pg_temp.comprobar((v_p ->> 'stock')::numeric = 1, 'con colchón propio de 4 sobre 5, la tienda tenía que ver 1');
  update public.canal_producto set colchon = 10 where canal_id = v_canal and producto_id = v_a;
  v_p := pg_temp.producto_en(app.catalogo_de_canal(v_canal, null, 1000, v_hasta), v_a);
  perform pg_temp.comprobar((v_p ->> 'stock')::numeric = 0, 'un colchón más grande que el stock tiene que dar 0');
  update public.canal_producto set colchon = null where canal_id = v_canal and producto_id = v_a;

  -- ─── 6. Las condiciones: prendido no alcanza ───
  v_r := app.catalogo_de_canal(v_canal, null, 1000, v_hasta);
  perform pg_temp.comprobar(pg_temp.producto_en(v_r, v_fito) is null, 'salió un fitosanitario');
  perform pg_temp.comprobar(pg_temp.producto_en(v_r, v_sin_nom) is null, 'salió un producto sin nombre público');
  perform pg_temp.comprobar(pg_temp.producto_en(v_r, v_sin_prec) is null, 'salió un producto sin precio');
  perform pg_temp.comprobar(
    (select motivo from app.productos_de_canal(v_canal) where producto_id = v_sin_nom) = 'Le falta el nombre público',
    'el motivo del producto sin nombre no es el esperado');

  -- ─── 7. La lista de precios de la tienda ───
  insert into public.lista_precio (nombre, ajuste_porcentaje, orden)
  values ('Prueba web API', 10, 999) returning id into v_lista;
  update public.canal set lista_precio_id = v_lista where id = v_canal;
  v_p := pg_temp.producto_en(app.catalogo_de_canal(v_canal, null, 1000, v_hasta), v_a);
  perform pg_temp.comprobar((v_p ->> 'precio')::numeric = 11000,
    format('con una lista de +10%%, 10000 tenía que dar 11000 y dio %s', v_p ->> 'precio'));
  insert into public.producto_precio_lista (producto_id, lista_precio_id, precio) values (v_a, v_lista, 9999.99);
  v_p := pg_temp.producto_en(app.catalogo_de_canal(v_canal, null, 1000, v_hasta), v_a);
  perform pg_temp.comprobar((v_p ->> 'precio')::numeric = 9999.99, 'el precio fijo del producto en la lista no le ganó al ajuste');

  begin
    update public.lista_precio set activo = false where id = v_lista;
    perform pg_temp.comprobar(false, 'se pudo dar de baja la lista que usa la tienda');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'La lista "Prueba web API" es la que usa la tienda online%', sqlerrm);
  end;
  update public.canal set lista_precio_id = v_contado where id = v_canal;

  -- ─── 8. Lo que deja de publicarse viaja como baja, sin datos ───
  update public.canal_producto set publicar = false where canal_id = v_canal and producto_id = v_b;
  v_marca := app.marca_codificar(now() - interval '1 hour', '00000000-0000-0000-0000-000000000000', false);
  v_r := app.catalogo_de_canal(v_canal, v_marca, 1000, v_hasta);
  v_p := pg_temp.producto_en(v_r, v_b);
  perform pg_temp.comprobar(v_p is not null, 'un producto que se apagó no le llegó a la tienda como baja');
  perform pg_temp.comprobar(pg_temp.claves(v_p) = 'actualizado_en,id,publicado' and not (v_p ->> 'publicado')::boolean,
    format('la baja lleva de más o de menos: %s', v_p::text));
  perform pg_temp.comprobar(pg_temp.producto_en(app.catalogo_de_canal(v_canal, null, 1000, v_hasta), v_b) is null,
    'el catálogo entero trae un producto que no está a la venta');

  -- ─── 9. El cambio de stock cuenta como cambio del producto ───
  update public.stock_saldo set actualizado_en = now() + interval '1 minute' where producto_id = v_a;
  v_p := pg_temp.producto_en(app.catalogo_de_canal(v_canal, null, 1000, now() + interval '2 minutes'), v_a);
  perform pg_temp.comprobar((v_p ->> 'actualizado_en')::timestamptz = now() + interval '1 minute',
    'la fecha del producto no toma la de su stock');
  update public.stock_saldo set actualizado_en = now() where producto_id = v_a;

  -- ─── 10. De a una página: ni saltea ni repite ───
  v_marca := null;
  loop
    v_r := app.catalogo_de_canal(v_canal, v_marca, 1, v_hasta);
    v_paginas := v_paginas + 1;
    v_vistos := v_vistos || array(select (e ->> 'id')::uuid from json_array_elements(v_r -> 'productos') e);
    v_hay_mas := (v_r ->> 'hay_mas')::boolean;
    v_marca := v_r ->> 'siguiente';
    exit when not v_hay_mas or v_paginas > 500;
  end loop;
  perform pg_temp.comprobar(array_length(array_positions(v_vistos, v_a), 1) = 1
                            and array_length(array_positions(v_vistos, v_c), 1) = 1,
    'recorriendo de a una página, un producto no apareció o apareció dos veces');
  perform pg_temp.comprobar(array_positions(v_vistos, v_b) = '{}', 'el recorrido completo trajo un producto apagado');
  perform pg_temp.comprobar(
    (convert_from(decode(translate(v_marca, '-_', '+/') || repeat('=', (4 - length(v_marca) % 4) % 4), 'base64'), 'UTF8')::json ->> 'c')::boolean = false,
    'terminado el catálogo entero, la marca sigue en modo "entero" y no pasa a "cambios"');

  -- ─── 11. Lo que está justo en la marca de agua no se pierde ───
  v_r := app.catalogo_de_canal(v_canal, null, 1000, now());
  perform pg_temp.comprobar(pg_temp.producto_en(v_r, v_a) is null,
    'salió un producto con fecha igual a la marca de agua: podría estar a medio guardar');
  v_r := app.catalogo_de_canal(v_canal, v_r ->> 'siguiente', 1000, v_hasta);
  perform pg_temp.comprobar(pg_temp.producto_en(v_r, v_a) is not null,
    'lo que quedó en la marca de agua no apareció en la consulta siguiente');

  -- ─── 12. La clave ───
  begin
    perform public.api_tienda_catalogo('gross_esta_clave_no_existe_para_nada_1234567890');
    perform pg_temp.comprobar(false, 'entró una clave inventada');
  exception when sqlstate 'PT401' then perform pg_temp.comprobar(true, '');
  end;
  begin
    perform public.api_tienda_catalogo(null);
    perform pg_temp.comprobar(false, 'entró sin clave');
  exception when sqlstate 'PT401' then perform pg_temp.comprobar(true, '');
  end;

  v_clave := app.crear_clave_api(v_canal, 'Prueba automática');
  perform pg_temp.comprobar(v_clave like 'gross\_%' and length(v_clave) = 49, 'la clave no tiene la forma esperada');
  perform pg_temp.comprobar(not exists (select 1 from public.clave_api where position(v_clave in encode(huella, 'escape')) > 0
                                        or prefijo = v_clave),
    'la clave quedó guardada en claro');
  v_r := public.api_tienda_catalogo(v_clave);
  perform pg_temp.comprobar(pg_temp.claves(v_r) = 'canal,frescura,generado_en,hay_mas,productos,siguiente',
    'con una clave buena, la respuesta no tiene la forma esperada');
  perform pg_temp.comprobar(v_r ->> 'canal' = 'Tienda online', 'la clave no quedó atada al canal de la tienda');
  perform pg_temp.comprobar((select ultimo_uso_en from public.clave_api where prefijo = left(v_clave, 12)) is not null,
    'no quedó anotado el uso de la clave');
  v_r := public.api_tienda_clasificaciones(v_clave);
  perform pg_temp.comprobar(pg_temp.claves(v_r) = 'animales,categorias,etapas_de_vida,generado_en,marcas,presentaciones',
    format('las clasificaciones no tienen la forma esperada: %s', pg_temp.claves(v_r)));
  perform pg_temp.comprobar(position('"alimentos"' in v_r::text) > 0 and position('"perros"' in v_r::text) > 0,
    'las clasificaciones no traen los slugs');

  perform app.anular_clave_api(left(v_clave, 12));
  begin
    perform public.api_tienda_catalogo(v_clave);
    perform pg_temp.comprobar(false, 'una clave anulada siguió entrando');
  exception when sqlstate 'PT401' then perform pg_temp.comprobar(true, '');
  end;
  begin
    perform public.api_tienda_clasificaciones(v_clave);
    perform pg_temp.comprobar(false, 'una clave anulada siguió leyendo las clasificaciones');
  exception when sqlstate 'PT401' then perform pg_temp.comprobar(true, '');
  end;

  -- ─── 13. Parámetros inválidos ───
  begin
    perform app.catalogo_de_canal(v_canal, 'esto-no-es-una-marca', 10, v_hasta);
    perform pg_temp.comprobar(false, 'aceptó una marca inventada');
  exception when sqlstate 'PT400' then perform pg_temp.comprobar(sqlerrm = 'desde_invalido', sqlerrm);
  end;
  begin
    perform app.catalogo_de_canal(v_canal, null, 0, v_hasta);
    perform pg_temp.comprobar(false, 'aceptó limite 0');
  exception when sqlstate 'PT400' then perform pg_temp.comprobar(sqlerrm = 'limite_invalido', sqlerrm);
  end;
  begin
    perform app.catalogo_de_canal(v_canal, null, 1001, v_hasta);
    perform pg_temp.comprobar(false, 'aceptó limite 1001');
  exception when sqlstate 'PT400' then perform pg_temp.comprobar(sqlerrm = 'limite_invalido', sqlerrm);
  end;

  -- ─── 14. Cambiar lo que cuelga del producto le mueve la fecha ───
  -- Primero el borrado, antes de que las altas de abajo le muevan la
  -- fecha a todo: la ficha guarda los animales borrando y volviendo a
  -- escribir, y a un producto al que le sacan todos no le queda fila.
  select pa.producto_id into v_con_animal from public.producto_animal pa
    join public.producto p on p.id = pa.producto_id
    where p.actualizado_en < now() and p.codigo not like 'PRUEBA-API-%' limit 1;
  perform pg_temp.comprobar(v_con_animal is not null, 'no hay un producto real con animales para probar el borrado');
  delete from public.producto_animal where producto_id = v_con_animal;
  perform pg_temp.comprobar((select actualizado_en from public.producto where id = v_con_animal) = now(),
    'sacarle los animales no movió la fecha del producto');

  select array_agg(id order by codigo) into v_real
  from (select id, codigo from public.producto
        where actualizado_en < now() and codigo not like 'PRUEBA-API-%'
        order by codigo limit 5) x;
  perform pg_temp.comprobar(array_length(v_real, 1) = 5, 'no hay cinco productos reales para probar las fechas');

  insert into public.producto_animal (producto_id, animal_id)
    select v_real[1], a.id from public.animal a
    where not exists (select 1 from public.producto_animal pa where pa.producto_id = v_real[1] and pa.animal_id = a.id)
    limit 1;
  insert into public.producto_etapa_vida (producto_id, etapa_vida_id)
    select v_real[2], e.id from public.etapa_vida e
    where not exists (select 1 from public.producto_etapa_vida pe where pe.producto_id = v_real[2] and pe.etapa_vida_id = e.id)
    limit 1;
  insert into public.producto_codigo_barra (producto_id, codigo) values (v_real[3], 'PRUEBA-API-CB-3');
  insert into public.canal_producto (canal_id, producto_id) values (v_canal, v_real[4]) on conflict do nothing;
  insert into public.producto_precio_lista (producto_id, lista_precio_id, precio) values (v_real[5], v_contado, 1)
    on conflict do nothing;
  perform pg_temp.comprobar((select actualizado_en from public.producto where id = v_real[1]) = now(), 'agregarle un animal no movió la fecha del producto');
  perform pg_temp.comprobar((select actualizado_en from public.producto where id = v_real[2]) = now(), 'agregarle una etapa no movió la fecha del producto');
  perform pg_temp.comprobar((select actualizado_en from public.producto where id = v_real[3]) = now(), 'agregarle un código de barra no movió la fecha del producto');
  perform pg_temp.comprobar((select actualizado_en from public.producto where id = v_real[4]) = now(), 'prenderlo en la tienda no movió la fecha del producto');
  perform pg_temp.comprobar((select actualizado_en from public.producto where id = v_real[5]) = now(), 'darle un precio fijo en una lista no movió la fecha del producto');

  -- ─── 15. La frescura para la tienda ───
  update public.terminal set ultima_sincronizacion = now() - interval '2 days', ultimo_error_sync = null
  where activo and eliminado_en is null;
  v_p := app.frescura_de_canal(v_canal);
  perform pg_temp.comprobar(not (v_p ->> 'confiable')::boolean, 'con todas las terminales calladas hace dos días dijo confiable');
  perform pg_temp.comprobar((v_p ->> 'minutos_sin_conexion')::integer = 2880, 'los minutos sin conexión no son dos días');

  update public.terminal set ultima_sincronizacion = now() - interval '1 minute'
  where id = (select id from public.terminal where tipo = 'caja' and activo and eliminado_en is null limit 1);
  v_p := app.frescura_de_canal(v_canal);
  perform pg_temp.comprobar((v_p ->> 'confiable')::boolean,
    'con la caja al día y un mostrador apagado dijo no confiable: una PC apagada no puede trabar la tienda');
  perform pg_temp.comprobar((v_p ->> 'minutos_sin_conexion')::integer = 1, 'los minutos sin conexión no toman la terminal más reciente');

  update public.terminal set ultimo_error_sync = 'Prueba: no pudo subir'
  where id = (select id from public.terminal where tipo = 'mostrador' and activo and eliminado_en is null limit 1);
  v_p := app.frescura_de_canal(v_canal);
  perform pg_temp.comprobar(not (v_p ->> 'confiable')::boolean,
    'con una terminal que no puede subir lo suyo dijo confiable');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;


-- ═══════════════════════════════════════════════════════════════
-- LA MARCA DE AGUA, CON DOS SESIONES A LA VEZ
--
-- Es lo único que no se puede probar dentro de una sola transacción, y
-- es lo más delicado: que un cambio que se está guardando mientras Zubu
-- consulta no quede detrás de la marca y se pierda. Se prueba así, con
-- un producto prendido para la tienda y una clave de prueba:
--
--  Sesión 1 (queda abierta 20 segundos, como un guardado lento):
--    update public.producto set descripcion = 'Prueba de la marca de agua'
--    where codigo = '<código>';
--    select pg_sleep(20);
--
--  Sesión 2, mientras la 1 duerme: pedir /catalogo con la marca del
--  catálogo entero, y guardar la "siguiente" que devuelve.
--
--  Cuando la 1 termina: pedir /catalogo con esa "siguiente". El producto
--  TIENE que aparecer, con la descripción nueva.
--
-- Rota a propósito (la marca de agua devolviendo now() sin mirar las
-- transacciones abiertas), el producto no aparece. Así se verificó el
-- 18/09: ver docs/api-tienda.md.
-- ═══════════════════════════════════════════════════════════════
