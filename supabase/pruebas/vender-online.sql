-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE «VENDER ONLINE», CONTRA LA BASE REAL
--
-- Lo que prende y apaga la venta online desde Productos, y la lista de
-- precios de la tienda. Se corre igual que api-tienda.sql: entero, y
-- termina siempre con un error a propósito que deshace todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad (el primero con cuenta), para
-- que los controles de permiso funcionen como en la aplicación, y como
-- alguien sin cuenta para ver que lo frenan.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALLA: %', p_que;
  end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

create type pg_temp.estado_t as (vender boolean, colchon numeric, stock numeric, precio numeric, motivo text);

create function pg_temp.estado(p_id uuid)
returns pg_temp.estado_t language sql as $$
  select e.vender_online, e.colchon_propio, e.stock, e.precio, e.motivo
  from public.estado_en_tienda(array[p_id]) e
$$;

do $$
declare
  v_admin    uuid;
  v_canal    uuid;
  v_contado  uuid;
  v_cat      uuid;
  v_cat_otra uuid;
  v_marca    uuid;
  v_lista    uuid;
  v_baja     uuid;
  v_a        uuid;
  v_b        uuid;
  v_c        uuid;
  v_n        integer;
  v_j        json;
  v_sin_nombre uuid;
  v_e        pg_temp.estado_t;
  v_api      json;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  v_canal := app.canal_de_la_tienda();
  select lista_precio_id into v_contado from public.canal where id = v_canal;

  -- ─── Datos de prueba: una categoría y una marca propias, para contar exacto ───
  insert into public.categoria (nombre, slug) values ('Prueba vender online', 'prueba-vender-online') returning id into v_cat;
  insert into public.categoria (nombre, slug) values ('Prueba otra', 'prueba-otra') returning id into v_cat_otra;
  insert into public.marca (nombre, slug) values ('Marca de prueba VO', 'marca-de-prueba-vo') returning id into v_marca;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta, categoria_id, marca_id)
    values ('PRUEBA-VO-A', 'PRUEBA VO A', 'Producto A', 10000, v_cat, v_marca) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta, categoria_id)
    values ('PRUEBA-VO-B', 'PRUEBA VO B', 'Producto B', 2000, v_cat) returning id into v_b;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta, categoria_id)
    values ('PRUEBA-VO-C', 'PRUEBA VO C', 'Producto C', 3000, v_cat_otra) returning id into v_c;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo)
    values (v_a, 'carga_inicial', 5, 'Prueba de vender online', 'manual');

  -- ─── 1. Un producto nuevo no se vende online ───
  v_e := pg_temp.estado(v_a);
  perform pg_temp.comprobar(not (v_e).vender and (v_e).motivo = 'No está marcado para vender online',
    'un producto recién creado ya se vendía online');

  -- ─── 2. Prender ───
  v_n := public.definir_venta_online(array[v_a], true);
  perform pg_temp.comprobar(v_n = 1, format('prender uno tenía que cambiar 1 y cambió %s', v_n));
  v_n := public.definir_venta_online(array[v_a], true);
  perform pg_temp.comprobar(v_n = 0, 'prender lo que ya estaba prendido contó como un cambio');
  v_e := pg_temp.estado(v_a);
  perform pg_temp.comprobar((v_e).vender and (v_e).motivo is null, 'prendido y completo, no sale');
  perform pg_temp.comprobar((v_e).stock = 3, format('con 5 y colchón 2 la ficha tenía que decir 3 y dice %s', (v_e).stock));

  -- La ficha y la tienda dicen lo mismo: salen de la misma cuenta
  v_api := app.catalogo_de_canal(v_canal, null, 1000, now() + interval '1 second');
  perform pg_temp.comprobar(
    (select (e ->> 'stock')::numeric = (v_e).stock and (e ->> 'precio')::numeric = (v_e).precio
     from json_array_elements(v_api -> 'productos') e where e ->> 'id' = v_a::text),
    'la ficha y la tienda no dicen el mismo stock o el mismo precio');

  -- ─── 3. Apagar ───
  v_n := public.definir_venta_online(array[v_c], false);
  perform pg_temp.comprobar(v_n = 0 and not exists (select 1 from public.canal_producto where producto_id = v_c),
    'apagar un producto que nunca se prendió creó una fila');
  v_n := public.definir_venta_online(array[v_a], false);
  perform pg_temp.comprobar(v_n = 1, 'apagar uno prendido no contó el cambio');
  perform pg_temp.comprobar((pg_temp.estado(v_a)).motivo = 'No está marcado para vender online', 'apagado, sigue saliendo');

  -- ─── 4. El colchón del producto ───
  perform public.definir_colchon_tienda(v_b, 3);
  v_e := pg_temp.estado(v_b);
  perform pg_temp.comprobar(not (v_e).vender and (v_e).colchon = 3, 'ponerle colchón a un producto apagado lo prendió');

  perform public.definir_venta_online(array[v_a], true);
  perform public.definir_colchon_tienda(v_a, 4);
  v_e := pg_temp.estado(v_a);
  perform pg_temp.comprobar((v_e).colchon = 4 and (v_e).stock = 1, format('con colchón propio de 4 sobre 5 tenía que ver 1 y ve %s', (v_e).stock));
  perform public.definir_colchon_tienda(v_a, null);
  v_e := pg_temp.estado(v_a);
  perform pg_temp.comprobar((v_e).colchon is null and (v_e).stock = 3, 'sacarle el colchón propio no lo devolvió al del canal');
  begin
    perform public.definir_colchon_tienda(v_a, -1);
    perform pg_temp.comprobar(false, 'aceptó un colchón negativo');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'El colchón no puede ser negativo%', sqlerrm);
  end;

  -- ─── 5. Una categoría o una marca entera ───
  begin
    perform public.definir_venta_online_por_clasificacion(null, null, true);
    perform pg_temp.comprobar(false, 'sin categoría ni marca prendió todo el catálogo');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Elegí una categoría o una marca%', sqlerrm);
  end;
  perform public.definir_venta_online(array[v_a], false);
  v_j := public.definir_venta_online_por_clasificacion(v_cat, null, true);
  perform pg_temp.comprobar((v_j ->> 'cambiados')::integer = 2,
    format('la categoría tiene 2 productos y prendió %s', v_j ->> 'cambiados'));
  perform pg_temp.comprobar((v_j ->> 'sin_salir')::integer = 0, 'contó como "no sale" un producto que sí sale');
  perform pg_temp.comprobar(not (pg_temp.estado(v_c)).vender, 'prendió un producto de otra categoría');
  v_j := public.definir_venta_online_por_clasificacion(v_cat, v_marca, false);
  perform pg_temp.comprobar((v_j ->> 'cambiados')::integer = 1 and not (pg_temp.estado(v_a)).vender and (pg_temp.estado(v_b)).vender,
    'categoría y marca juntas no tomaron sólo los de las dos');

  /*
    Lo que dispara el aviso de la pantalla: prendido y sin salir. Es el
    dato que evita que alguien prenda 800 productos y descubra semanas
    después que 37 nunca llegaron a la web.
  */
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta, categoria_id)
    values ('PRUEBA-VO-D', 'PRUEBA VO D', null, 4000, v_cat) returning id into v_sin_nombre;
  v_j := public.definir_venta_online_por_clasificacion(v_cat, null, true);
  perform pg_temp.comprobar((v_j ->> 'sin_salir')::integer = 1,
    format('uno de la categoría no tiene nombre público: sin_salir tenía que ser 1 y es %s', v_j ->> 'sin_salir'));

  -- Los dados de baja no se prenden, ni uno por uno ni por categoría
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta, categoria_id, eliminado_en, activo)
    values ('PRUEBA-VO-X', 'PRUEBA VO X', 'Dado de baja', 1000, v_cat, now(), false) returning id into v_baja;
  v_n := public.definir_venta_online(array[v_baja], true);
  perform public.definir_venta_online_por_clasificacion(v_cat, null, true);
  perform pg_temp.comprobar(not exists (select 1 from public.canal_producto where producto_id = v_baja),
    'se prendió un producto dado de baja');

  -- ─── 6. La lista de la tienda ───
  insert into public.lista_precio (nombre, ajuste_porcentaje, orden, activo, eliminado_en)
    values ('Prueba VO dada de baja', 5, 998, false, now()) returning id into v_lista;
  begin
    perform public.elegir_lista_de_la_tienda(v_lista);
    perform pg_temp.comprobar(false, 'se pudo elegir una lista dada de baja');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'Esa lista no existe o está dada de baja.', sqlerrm);
  end;
  insert into public.lista_precio (nombre, ajuste_porcentaje, orden) values ('Prueba VO web', 10, 999) returning id into v_lista;
  perform public.elegir_lista_de_la_tienda(v_lista);
  perform pg_temp.comprobar((select lista_precio_id from public.canal where id = v_canal) = v_lista, 'no quedó elegida la lista');
  perform public.definir_venta_online(array[v_a], true);
  perform pg_temp.comprobar((pg_temp.estado(v_a)).precio = 11000, 'con la lista de +10% la ficha no dice 11000');
  perform public.elegir_lista_de_la_tienda(v_contado);

  -- ─── 7. Sin permiso, nada ───
  perform pg_temp.como(gen_random_uuid());
  begin
    perform public.definir_venta_online(array[v_c], true);
    perform pg_temp.comprobar(false, 'alguien sin permiso prendió un producto');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para modificar productos.', sqlerrm);
  end;
  begin
    perform public.definir_venta_online_por_clasificacion(v_cat_otra, null, true);
    perform pg_temp.comprobar(false, 'alguien sin permiso prendió una categoría');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para modificar productos.', sqlerrm);
  end;
  begin
    perform public.definir_colchon_tienda(v_c, 1);
    perform pg_temp.comprobar(false, 'alguien sin permiso le puso colchón a un producto');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para modificar productos.', sqlerrm);
  end;
  begin
    perform public.elegir_lista_de_la_tienda(v_contado);
    perform pg_temp.comprobar(false, 'alguien sin permiso eligió la lista de la tienda');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para administrar precios.', sqlerrm);
  end;
  begin
    perform public.estado_en_tienda(array[v_a]);
    perform pg_temp.comprobar(false, 'alguien sin permiso leyó el estado en la tienda');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para ver productos.', sqlerrm);
  end;

  -- La llave pública (la de la tienda) no las puede llamar
  perform pg_temp.comprobar(
    not has_function_privilege('anon', 'public.definir_venta_online(uuid[], boolean)', 'execute')
    and not has_function_privilege('anon', 'public.definir_venta_online_por_clasificacion(uuid, uuid, boolean)', 'execute')
    and not has_function_privilege('anon', 'public.definir_colchon_tienda(uuid, numeric)', 'execute')
    and not has_function_privilege('anon', 'public.elegir_lista_de_la_tienda(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.estado_en_tienda(uuid[])', 'execute'),
    'la llave pública puede llamar a las funciones de la aplicación');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
