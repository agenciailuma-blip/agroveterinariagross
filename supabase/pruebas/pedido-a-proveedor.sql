-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL PEDIDO A PROVEEDOR, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; las órdenes y los pedidos se
-- hacen como un Administrador de verdad, y sin cuenta.
--
-- Lo que se cuida: que aparezca todo lo que se le compra a un proveedor
-- y nada más (ni las sueltas, ni lo dado de baja); que lo que pidieron
-- las órdenes internas se sume por producto; que una orden con
-- renglones de dos proveedores quede pedida recién cuando se pidieron
-- los dos; que anular el pedido la devuelva a pendiente; y que un
-- pedido armado sobre una orden que ya cambió no salga.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Espera un error con el mensaje que corresponde, no «cualquier error».
create function pg_temp.falla(p_sql text, p_mensaje text, p_que text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.comprobar(false, p_que);
exception when others then
  perform pg_temp.comprobar(sqlerrm like p_mensaje, p_que || ' — dijo: ' || sqlerrm);
end $$;

create function pg_temp.id(p_codigo text) returns uuid language sql as $$
  select id from public.producto where codigo = p_codigo
$$;

-- El renglón de una orden interna, por el número de la orden y el renglón.
create function pg_temp.lin(p_numero bigint, p_renglon int) returns uuid language sql as $$
  select l.id from public.orden_compra_interna_linea l
    join public.orden_compra_interna o on o.id = l.orden_id
   where o.numero = p_numero and l.renglon = p_renglon
$$;

create function pg_temp.estado_orden(p_numero bigint) returns text language sql as $$
  select estado from public.orden_compra_interna where numero = p_numero
$$;

do $$
declare
  v_admin   uuid;
  v_a       uuid;
  v_b       uuid;
  v_dep     uuid;
  v_compras uuid;
  v_o1      bigint;
  v_o2      bigint;
  v_o3      bigint;
  v_pa      uuid := gen_random_uuid();
  v_pb      uuid := gen_random_uuid();
  v_na      bigint;
  v_nb      bigint;
  v_cuantos bigint;
  v_json    jsonb;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ─── Datos: dos proveedores, sus productos y tres órdenes ───
  insert into public.proveedor (nombre, minimo_tipo, minimo_valor) values ('PRUEBA PEDIDO A', 'kilos', 100) returning id into v_a;
  insert into public.proveedor (nombre) values ('PRUEBA PEDIDO B') returning id into v_b;
  insert into public.producto (codigo, nombre_interno, precio_venta, costo, alicuota_iva_id, proveedor_id, peso_kg, unidades_por_bulto) values
    ('PRUEBA-PED-1', 'PRUEBA PED ALIMENTO 15 KG', 80000, 50000, 5, v_a, 15, 1),
    ('PRUEBA-PED-2', 'PRUEBA PED PIPETA', 9000, 4000, 5, v_a, null, 12),
    ('PRUEBA-PED-CAJA', 'PRUEBA PED CAJA X10', 20000, 5000, 5, v_a, null, null),
    ('PRUEBA-PED-INACT', 'PRUEBA PED INACTIVO', 100, 50, 5, v_a, null, null),
    ('PRUEBA-PED-BAJA', 'PRUEBA PED DADO DE BAJA', 100, 50, 5, v_a, null, null),
    ('PRUEBA-PED-4', 'PRUEBA PED COLLAR', 6400, 3000, 5, v_a, null, null);
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, proveedor_id, envase_id, cantidad_por_envase)
    values ('PRUEBA-PED-SUELTA', 'PRUEBA PED SUELTA', 2500, 5, v_a, pg_temp.id('PRUEBA-PED-CAJA'), 10);
  update public.producto set activo = false where codigo = 'PRUEBA-PED-INACT';
  update public.producto set eliminado_en = now() where codigo = 'PRUEBA-PED-BAJA';
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo) values
    (pg_temp.id('PRUEBA-PED-1'), 'carga_inicial', 2, 'manual'),
    (pg_temp.id('PRUEBA-PED-2'), 'carga_inicial', 50, 'manual');
  insert into public.umbral_stock (ambito, producto_id, bajo, critico) values ('producto', pg_temp.id('PRUEBA-PED-1'), 5, 2);

  select id into v_dep from public.sector where nombre = 'Depósito' and eliminado_en is null;
  select id into v_compras from public.sector where nombre = 'Compras' and eliminado_en is null;

  perform set_config('role', 'authenticated', true);
  -- O1: alimento y guantes a A, y el collar a B (aunque su ficha diga A).
  v_o1 := public.guardar_orden_interna(gen_random_uuid(), v_dep, v_compras, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-1'), 'proveedor_id', v_a, 'cantidad', 3),
    jsonb_build_object('descripcion', 'PRUEBA Guantes de látex', 'proveedor_id', v_a, 'cantidad', 2),
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-4'), 'proveedor_id', v_b, 'cantidad', 1)));
  -- O2: más alimento a A.
  v_o2 := public.guardar_orden_interna(gen_random_uuid(), v_dep, v_compras, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-1'), 'proveedor_id', v_a, 'cantidad', 2)));
  -- O3: anulada, no cuenta.
  v_o3 := public.guardar_orden_interna(gen_random_uuid(), v_dep, v_compras, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-2'), 'proveedor_id', v_a, 'cantidad', 9)));
  perform public.anular_orden_interna((select id from public.orden_compra_interna where numero = v_o3), 'Prueba');

  -- ─── 1. Lo que se le puede pedir a A ───
  select count(*) into v_cuantos from public.productos_para_pedido(v_a);
  perform pg_temp.comprobar(v_cuantos = 5,
    'a A no le aparecen sus 4 productos y los guantes, sino ' || v_cuantos);
  perform pg_temp.comprobar(
    (select descripcion = 'PRUEBA Guantes de látex' and producto_id is null and en_ordenes = 2
       from public.productos_para_pedido(v_a) limit 1),
    'lo que no está en el catálogo no va primero, con lo que pidió la orden');
  perform pg_temp.comprobar(
    (select codigo = 'PRUEBA-PED-1' from public.productos_para_pedido(v_a) where producto_id is not null limit 1),
    'el alimento crítico y pedido por dos órdenes no va primero entre los productos');
  perform pg_temp.comprobar(
    (select en_ordenes = 5 and ordenes = array[v_o1, v_o2] and estado = 'critico' and stock = 2
            and umbral_bajo = 5 and umbral_critico = 2 and costo = 50000 and not costo_de_este
            and peso_kg = 15 and unidades_por_bulto = 1 and cardinality(lineas_orden) = 2
       from public.productos_para_pedido(v_a) where codigo = 'PRUEBA-PED-1'),
    'el alimento no suma lo de las dos órdenes, o le falta el stock, el aviso, el costo o el peso');
  perform pg_temp.comprobar(
    (select en_ordenes = 0 from public.productos_para_pedido(v_a) where codigo = 'PRUEBA-PED-2'),
    'la orden anulada cuenta como pedido');
  perform pg_temp.comprobar(
    not exists (select 1 from public.productos_para_pedido(v_a)
                 where codigo in ('PRUEBA-PED-SUELTA', 'PRUEBA-PED-INACT', 'PRUEBA-PED-BAJA')),
    'aparece la suelta, el inactivo o el dado de baja');
  perform pg_temp.comprobar(
    (select en_ordenes = 0 and es_del_proveedor from public.productos_para_pedido(v_a) where codigo = 'PRUEBA-PED-4'),
    'el collar le suma a A lo que la orden le pidió a B');
  -- A B le aparece el collar, que no es suyo, porque una orden se lo pidió.
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(codigo = 'PRUEBA-PED-4' and en_ordenes = 1 and not es_del_proveedor)
       from public.productos_para_pedido(v_b)),
    'a B no le aparece sólo el collar que le pidió la orden');

  -- ─── 2. Lo que no sale ───
  perform pg_temp.falla(format('select public.hacer_pedido_proveedor(%L, %L, %L)', gen_random_uuid(), v_a, '[]'),
    'El pedido no tiene nada para pedir.', 'un pedido vacío salió');
  perform pg_temp.falla(format('select public.hacer_pedido_proveedor(%L, null, %L)', gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-2'), 'cantidad', 1))),
    'Falta elegir a qué proveedor se le pide.', 'un pedido sin proveedor salió');
  perform pg_temp.falla(format('select public.hacer_pedido_proveedor(%L, %L, %L)', gen_random_uuid(), v_a,
      jsonb_build_array(jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-2'), 'cantidad', 0))),
    'Al renglón 1 («PRUEBA PED PIPETA») le falta la cantidad.', 'un renglón en cero salió');
  perform pg_temp.comprobar(not exists (select 1 from public.pedido_proveedor where proveedor_id = v_a),
    'un pedido que no salió dejó la cabecera');

  -- ─── 3. El pedido a A ───
  v_na := public.hacer_pedido_proveedor(v_pa, v_a, jsonb_build_array(
    jsonb_build_object('descripcion', 'PRUEBA Guantes de látex', 'cantidad', 2,
                       'lineas_orden', jsonb_build_array(pg_temp.lin(v_o1, 2))),
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-1'), 'cantidad', 6, 'costo', 50000,
                       'lineas_orden', jsonb_build_array(pg_temp.lin(v_o1, 1), pg_temp.lin(v_o2, 1))),
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-2'), 'cantidad', 12, 'costo', 4000)),
    'Que venga con el viajante');
  perform pg_temp.comprobar(v_na is not null, 'el pedido no devolvió su número');
  perform pg_temp.comprobar(
    (select count(*) = 3 and sum(cantidad * costo) = 348000
            and bool_or(codigo = 'PRUEBA-PED-1' and peso_kg = 15 and unidades_por_bulto = 1)
       from public.pedido_proveedor_linea where pedido_id = v_pa),
    'los renglones no quedaron con su cantidad, su costo, el código y el peso');
  perform pg_temp.comprobar(
    (select minimo_tipo = 'kilos' and minimo_valor = 100 and observacion = 'Que venga con el viajante'
       from public.pedido_proveedor where id = v_pa),
    'el pedido no guardó el mínimo del proveedor ni la observación');

  -- O2 se pidió entera; O1 todavía no: le falta el collar de B.
  perform pg_temp.comprobar(pg_temp.estado_orden(v_o2) = 'pedida' and pg_temp.estado_orden(v_o1) = 'pendiente',
    'O2 no quedó pedida, o O1 quedó pedida con el renglón de B sin pedir');
  perform pg_temp.comprobar(
    (select count(*) = 4 and bool_and(codigo is distinct from 'PRUEBA-PED-1' or en_ordenes = 0)
       from public.productos_para_pedido(v_a)),
    'después del pedido, A sigue viendo los guantes o lo que pidieron las órdenes');

  -- Reintentar no lo hace dos veces.
  perform pg_temp.comprobar(
    public.hacer_pedido_proveedor(v_pa, v_a, jsonb_build_array(
      jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-2'), 'cantidad', 1))) = v_na
    and (select count(*) from public.pedido_proveedor_linea where pedido_id = v_pa) = 3,
    'reintentar el mismo pedido hizo otro o le cambió los renglones');

  -- Un pedido armado sobre una orden que ya se pidió no sale.
  perform pg_temp.falla(format('select public.hacer_pedido_proveedor(%L, %L, %L)', gen_random_uuid(), v_a,
      jsonb_build_array(jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-1'), 'cantidad', 3,
                                           'lineas_orden', jsonb_build_array(pg_temp.lin(v_o1, 1))))),
    'Una orden interna cambió mientras se armaba el pedido%', 'un pedido sobre una orden ya pedida salió');
  -- Ni sobre el renglón de otro proveedor.
  perform pg_temp.falla(format('select public.hacer_pedido_proveedor(%L, %L, %L)', gen_random_uuid(), v_a,
      jsonb_build_array(jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-4'), 'cantidad', 1,
                                           'lineas_orden', jsonb_build_array(pg_temp.lin(v_o1, 3))))),
    'Una orden interna cambió mientras se armaba el pedido%', 'A se llevó el renglón que la orden le pidió a B');
  perform pg_temp.comprobar((select count(*) from public.pedido_proveedor where proveedor_id = v_a) = 1,
    'un pedido que no salió quedó guardado a medias');

  -- ─── 4. El pedido a B cierra O1 ───
  v_nb := public.hacer_pedido_proveedor(v_pb, v_b, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-4'), 'cantidad', 1,
                       'lineas_orden', jsonb_build_array(pg_temp.lin(v_o1, 3)))));
  perform pg_temp.comprobar(pg_temp.estado_orden(v_o1) = 'pedida',
    'con los dos proveedores pedidos, O1 no quedó pedida');

  -- Lo que ve la pantalla: el pedido entero y cada renglón de la orden con su pedido.
  v_json := public.pedido_a_proveedor(v_pa);
  perform pg_temp.comprobar(
    (v_json->>'numero')::bigint = v_na and v_json->>'proveedor' = 'PRUEBA PEDIDO A'
    and jsonb_array_length(v_json->'lineas') = 3
    and (select array_agg(x::bigint order by x::bigint) from jsonb_array_elements_text(v_json->'ordenes') x) = array[v_o1, v_o2],
    'el pedido no dice su proveedor, sus renglones o las órdenes que cubrió: ' || v_json::text);
  v_json := public.orden_interna((select id from public.orden_compra_interna where numero = v_o1));
  perform pg_temp.comprobar(
    (select count(*) filter (where (l->>'pedido_numero')::bigint = v_na) = 2
            and count(*) filter (where (l->>'pedido_numero')::bigint = v_nb) = 1
       from jsonb_array_elements(v_json->'lineas') l),
    'la orden no dice en qué pedido entró cada renglón: ' || (v_json->'lineas')::text);
  perform pg_temp.comprobar(
    (select total = 348000 and renglones = 3 from public.pedidos_a_proveedores(null, 50) where id = v_pa),
    'la lista de pedidos no tiene el total o los renglones');

  -- ─── 5. Anular el pedido a A devuelve las órdenes ───
  perform pg_temp.falla(format('select public.anular_pedido_proveedor(%L, %L)', v_pa, '  '),
    'Para anular un pedido hay que decir por qué.', 'se anuló sin motivo');
  perform public.anular_pedido_proveedor(v_pa, 'Prueba del sistema');
  perform pg_temp.comprobar(pg_temp.estado_orden(v_o1) = 'pendiente' and pg_temp.estado_orden(v_o2) = 'pendiente',
    'anular el pedido no devolvió las dos órdenes a pendiente');
  perform pg_temp.comprobar(
    (select pedido_id is null from public.orden_compra_interna_linea where id = pg_temp.lin(v_o1, 1))
    and (select pedido_id = v_pb from public.orden_compra_interna_linea where id = pg_temp.lin(v_o1, 3)),
    'anular A soltó también el renglón que pidió B, o no soltó los suyos');
  perform pg_temp.comprobar(
    (select en_ordenes = 5 from public.productos_para_pedido(v_a) where codigo = 'PRUEBA-PED-1'),
    'después de anular, el alimento no vuelve a mostrar lo que pidieron las órdenes');
  perform pg_temp.falla(format('select public.anular_pedido_proveedor(%L, %L)', v_pa, 'otra vez'),
    'El pedido % ya estaba anulado.', 'se anuló dos veces');

  -- ─── 6. El mínimo del proveedor ───
  reset role;
  perform pg_temp.falla(format('update public.proveedor set minimo_valor = null where id = %L', v_a),
    '%proveedor_minimo_completo%', 'quedó un mínimo en kilos sin número');
  perform pg_temp.falla(format('update public.proveedor set minimo_valor = 0 where id = %L', v_a),
    '%proveedor_minimo_valor_check%', 'quedó un mínimo en cero');
  perform pg_temp.falla(format('update public.proveedor set minimo_tipo = %L where id = %L', 'litros', v_a),
    '%proveedor_minimo_tipo_check%', 'quedó un mínimo en litros');

  -- ─── 7. Sin cuenta, nada ───
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.falla(format('select * from public.productos_para_pedido(%L)', v_a),
    'No tenés permiso para armar pedidos a proveedores.', 'alguien sin cuenta vio lo que se le compra a A');
  perform pg_temp.falla(format('select public.hacer_pedido_proveedor(%L, %L, %L)', gen_random_uuid(), v_a,
      jsonb_build_array(jsonb_build_object('producto_id', pg_temp.id('PRUEBA-PED-2'), 'cantidad', 1))),
    'No tenés permiso para hacer pedidos a proveedores.', 'alguien sin cuenta hizo un pedido');
  perform pg_temp.falla(format('select public.anular_pedido_proveedor(%L, %L)', v_pb, 'porque sí'),
    'No tenés permiso para anular pedidos a proveedores.', 'alguien sin cuenta anuló un pedido');
  perform pg_temp.comprobar(not exists (select 1 from public.pedido_proveedor),
    'alguien sin cuenta lee los pedidos directo de la tabla');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
