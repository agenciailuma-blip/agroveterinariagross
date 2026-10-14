-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA RECEPCIÓN DESDE EL PEDIDO, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; los pedidos, las facturas
-- atadas y las recepciones, como un Administrador de verdad.
--
-- El caso: se pidieron 6 bolsas, 24 pipetas y unos guantes que no están
-- en el catálogo. Llegan en dos facturas: primero las bolsas y 10
-- pipetas, después las 14 que faltaban.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

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

create function pg_temp.factura(p_proveedor uuid, p_numero bigint) returns uuid language sql as $$
  insert into public.compra (proveedor_id, tipo_comprobante_id, punto_venta, numero, fecha,
                             neto_gravado, neto_no_gravado, exento, iva_total, tributos_total)
  values (p_proveedor, (select id from public.tipo_comprobante where clase = 'A' and signo = 1 order by id limit 1),
          9, p_numero, current_date, 0, 0, 0, 0, 0)
  returning id
$$;

create function pg_temp.estado(p_pedido uuid) returns text language sql as $$
  select estado from public.pedido_proveedor where id = p_pedido
$$;

do $$
declare
  v_admin uuid;
  v_a uuid; v_b uuid; v_cli uuid; v_dep uuid; v_com uuid;
  v_orden uuid := gen_random_uuid();
  v_pa uuid := gen_random_uuid();
  v_pb uuid := gen_random_uuid();
  v_f1 uuid; v_f2 uuid; v_fb uuid; v_f4 uuid;
  v_json jsonb;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ─── Datos ───
  insert into public.proveedor (nombre) values ('PRUEBA RECEP A') returning id into v_a;
  insert into public.proveedor (nombre) values ('PRUEBA RECEP B') returning id into v_b;
  insert into public.producto (codigo, nombre_interno, precio_venta, costo, alicuota_iva_id, proveedor_id) values
    ('PRUEBA-REC-1', 'PRUEBA REC ALIMENTO 15 KG', 80000, 50000, 5, v_a),
    ('PRUEBA-REC-2', 'PRUEBA REC PIPETA', 9000, 4000, 5, v_a);
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento)
    values ('PRUEBA CLIENTE AVISO', 5, 96, '99999997') returning id into v_cli;
  select id into v_dep from public.sector where nombre = 'Depósito' and eliminado_en is null;
  select id into v_com from public.sector where nombre = 'Compras' and eliminado_en is null;
  v_f1 := pg_temp.factura(v_a, 900001);
  v_f2 := pg_temp.factura(v_a, 900002);
  v_f4 := pg_temp.factura(v_a, 900004);
  v_fb := pg_temp.factura(v_b, 900003);

  perform set_config('role', 'authenticated', true);
  perform public.guardar_orden_interna(v_orden, v_dep, v_com, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-1'), 'proveedor_id', v_a, 'cantidad', 6),
    jsonb_build_object('descripcion', 'PRUEBA guantes', 'proveedor_id', v_a, 'cantidad', 2)),
    null, null, v_cli, '3755-111111');
  perform public.hacer_pedido_proveedor(v_pa, v_a, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-1'), 'cantidad', 6,
      'lineas_orden', jsonb_build_array((select id from public.orden_compra_interna_linea where orden_id = v_orden and renglon = 1))),
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-2'), 'cantidad', 24),
    jsonb_build_object('descripcion', 'PRUEBA guantes', 'cantidad', 2,
      'lineas_orden', jsonb_build_array((select id from public.orden_compra_interna_linea where orden_id = v_orden and renglon = 2)))));

  -- ─── 1. Lo que espera mercadería ───
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(id = v_pa and renglones = 3 and not llego_algo) from public.pedidos_por_recibir(v_a)),
    'el pedido no aparece entre los que esperan mercadería');
  perform pg_temp.comprobar(not exists (select 1 from public.pedidos_por_recibir(v_b)),
    'a B le aparece el pedido de A');
  perform pg_temp.comprobar(
    (select count(*) = 3
            and bool_or(codigo = 'PRUEBA-REC-1' and falta = 6 and recibido = 0 and alicuota_iva_id = 5)
            and bool_or(codigo = 'PRUEBA-REC-2' and falta = 24)
            and bool_or(producto_id is null and descripcion = 'PRUEBA guantes' and falta = 2)
       from public.pedido_para_recibir(v_pa)),
    'lo que falta del pedido no trae los dos productos y los guantes aparte');

  -- ─── 2. Atar la factura ───
  perform pg_temp.falla(format('select public.atar_compra_a_pedido(%L, %L)', v_fb, v_pa),
    'El pedido % es a otro proveedor.', 'una factura de B se ató al pedido de A');
  perform public.atar_compra_a_pedido(v_f1, v_pa);
  perform pg_temp.comprobar((select pedido_id = v_pa from public.compra where id = v_f1), 'la factura no quedó atada');

  -- ─── 3. Llega una parte ───
  perform public.recibir_mercaderia(v_f1, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-1'), 'cantidad', 6, 'costo_unitario', 41000),
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-2'), 'cantidad', 10, 'costo_unitario', 3300)), null);
  perform pg_temp.comprobar(pg_temp.estado(v_pa) = 'pedido', 'con pipetas faltando, el pedido quedó ' || pg_temp.estado(v_pa));
  perform pg_temp.comprobar(
    (select count(*) = 2 and bool_and(codigo = 'PRUEBA-REC-2' and falta = 14 and recibido = 10 or producto_id is null)
       from public.pedido_para_recibir(v_pa)),
    'después de la primera factura no queda sólo lo que falta: 14 pipetas y los guantes');
  perform pg_temp.comprobar((select llego_algo from public.pedidos_por_recibir(v_a) where id = v_pa),
    'el pedido no dice que ya llegó algo');
  v_json := public.pedido_a_proveedor(v_pa);
  perform pg_temp.comprobar(
    (select bool_and(case l->>'codigo' when 'PRUEBA-REC-1' then (l->>'recibido')::numeric = 6
                                       when 'PRUEBA-REC-2' then (l->>'recibido')::numeric = 10
                                       else l->>'recibido' is null end)
       from jsonb_array_elements(v_json->'lineas') l)
    and jsonb_array_length(v_json->'facturas') = 1,
    'el pedido no dice cuánto llegó de cada renglón ni en qué factura: ' || v_json::text);
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(a->>'cliente' = 'PRUEBA CLIENTE AVISO' and a->>'contacto' = '3755-111111'
                                      and a->>'que' like '%PRUEBA REC ALIMENTO%' and a->>'que' like '%PRUEBA guantes%')
       from jsonb_array_elements(v_json->'avisar') a),
    'el pedido no dice a qué cliente avisarle: ' || (v_json->'avisar')::text);

  -- Con mercadería recibida no se anula, y la factura recibida no se desata.
  perform pg_temp.falla(format('select public.anular_pedido_proveedor(%L, %L)', v_pa, 'Prueba'),
    'Del pedido % ya llegó mercadería (factura 0009-00900001): no se anula.%', 'se anuló un pedido con mercadería recibida');
  perform pg_temp.falla(format('select public.atar_compra_a_pedido(%L, null)', v_f1),
    'La mercadería de esa factura ya se recibió%', 'se desató una factura ya recibida');

  -- ─── 4. Llega el resto: se da por recibido solo ───
  perform public.atar_compra_a_pedido(v_f2, v_pa);
  perform public.recibir_mercaderia(v_f2, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-2'), 'cantidad', 14, 'costo_unitario', 3300)), null);
  perform pg_temp.comprobar(
    (select estado = 'recibido' and recibido_en is not null and motivo_cierre is null from public.pedido_proveedor where id = v_pa),
    'con todo recibido, el pedido no quedó recibido solo');
  perform pg_temp.comprobar(not exists (select 1 from public.pedidos_por_recibir(v_a)),
    'un pedido recibido sigue esperando mercadería');
  perform pg_temp.comprobar((select llego_algo and estado = 'recibido' from public.pedidos_a_proveedores(null, 50) where id = v_pa),
    'la lista no muestra el pedido recibido');
  perform pg_temp.falla(format('select public.atar_compra_a_pedido(%L, %L)', v_f4, v_pa),
    'El pedido % ya está recibido.', 'se ató una factura a un pedido ya recibido');

  -- ─── 5. Dar de baja la factura que lo completó lo vuelve a pedido ───
  perform public.anular_compra(v_f2, 'Prueba: vino mal facturada');
  perform pg_temp.comprobar(pg_temp.estado(v_pa) = 'pedido',
    'dar de baja la factura que completó el pedido no lo volvió a pedido');
  perform pg_temp.comprobar((select falta = 14 from public.pedido_para_recibir(v_pa) where codigo = 'PRUEBA-REC-2'),
    'la factura dada de baja sigue contando como recibida');

  -- ─── 6. Darlo por terminado a mano ───
  perform pg_temp.falla(format('select public.cerrar_pedido_proveedor(%L, %L)', v_pa, ''),
    'Para darlo por terminado hay que decir por qué%', 'se cerró sin motivo');
  perform public.cerrar_pedido_proveedor(v_pa, 'Las pipetas no las tiene');
  perform pg_temp.comprobar(
    (select estado = 'recibido' and motivo_cierre = 'Las pipetas no las tiene' from public.pedido_proveedor where id = v_pa),
    'cerrado a mano no quedó recibido con su motivo');
  -- Uno cerrado a mano no se reabre solo.
  perform public.anular_compra(v_f1, 'Prueba');
  perform pg_temp.comprobar(pg_temp.estado(v_pa) = 'recibido', 'dar de baja una factura reabrió un pedido cerrado a mano');

  -- ─── 7. Anular un pedido con una factura atada pero sin recibir la suelta ───
  perform public.hacer_pedido_proveedor(v_pb, v_a, jsonb_build_array(
    jsonb_build_object('producto_id', pg_temp.id('PRUEBA-REC-2'), 'cantidad', 12)));
  perform public.atar_compra_a_pedido(v_f4, v_pb);
  perform public.anular_pedido_proveedor(v_pb, 'Prueba');
  perform pg_temp.comprobar((select pedido_id is null from public.compra where id = v_f4),
    'anular el pedido dejó atada una factura sin recibir');

  -- ─── 8. Sin cuenta, nada ───
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform pg_temp.falla(format('select * from public.pedidos_por_recibir(%L)', v_a),
    'No tenés permiso para ver los pedidos a proveedores.', 'sin cuenta ve lo que espera mercadería');
  perform pg_temp.falla(format('select public.atar_compra_a_pedido(%L, %L)', v_f4, v_pb),
    'No tenés permiso para recibir mercadería.', 'sin cuenta ata una factura');
  perform pg_temp.falla(format('select public.cerrar_pedido_proveedor(%L, %L)', v_pb, 'x'),
    'No tenés permiso para cerrar pedidos a proveedores.', 'sin cuenta cierra un pedido');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
