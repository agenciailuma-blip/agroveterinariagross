-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA RECEPCIÓN DE MERCADERÍA, CONTRA LA BASE REAL
--
-- Se corre igual que las otras: entera, y termina siempre con un error
-- a propósito que deshace todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad, para que los permisos se
-- controlen como en la aplicación, y como alguien sin cuenta para ver
-- que lo frenan.
--
-- Lo que se cuida: que el stock entre una sola vez, que el costo quede
-- con IVA sea cual sea la letra de la factura, que el precio no se
-- mueva solo, y que dar de baja la factura saque lo que había entrado.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.stock(p_producto uuid)
returns numeric language sql as $$
  select coalesce(sum(cantidad), 0) from public.movimiento_stock where producto_id = p_producto
$$;

create function pg_temp.factura(p_proveedor uuid, p_tipo smallint, p_numero bigint)
returns uuid language sql as $$
  select public.registrar_compra(p_proveedor, p_tipo, 7, p_numero, current_date, 0, 0, null,
    jsonb_build_array(jsonb_build_object('alicuota_iva_id', 5, 'base_imponible', 1000, 'importe', 210)))
$$;

do $$
declare
  v_admin  uuid;
  v_prov   uuid;
  v_a      uuid;   -- al 21%, con margen
  v_b      uuid;   -- al 10,5%, sin margen
  v_c      uuid;   -- exento
  v_fa     uuid;
  v_fb     uuid;
  v_nc     uuid;
  v_f0     uuid;
  v_r      jsonb;
  v_x      numeric;
  v_n      integer;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  -- ─── Datos de prueba ───
  insert into public.proveedor (nombre) values ('PRUEBA RECEPCIÓN') returning id into v_prov;
  insert into public.producto (codigo, nombre_interno, precio_venta, costo, margen_sobre_costo, alicuota_iva_id)
    values ('PRUEBA-REC-A', 'PRUEBA REC A', 1500, 1000, 40, 5) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id)
    values ('PRUEBA-REC-B', 'PRUEBA REC B', 900, 4) returning id into v_b;
  insert into public.producto (codigo, nombre_interno, precio_venta, condicion_iva)
    values ('PRUEBA-REC-C', 'PRUEBA REC C', 500, 'exento') returning id into v_c;

  /*
    De acá en adelante, como un usuario de verdad y no como dueño de la
    base: el dueño se saltea las políticas, y una función que corre con
    los permisos de quien la usa puede andar acá y fallar en la
    aplicación. Pasó el 25/09 con las devoluciones.
  */
  perform set_config('role', 'authenticated', true);

  -- ─── 1. Factura A: el costo del papel es sin IVA ───
  v_fa := pg_temp.factura(v_prov, 1::smallint, 101);
  v_r := public.recibir_mercaderia(v_fa, jsonb_build_array(
    jsonb_build_object('producto_id', v_a, 'cantidad', 10, 'costo_unitario', 1000),
    jsonb_build_object('producto_id', v_b, 'cantidad', 4,  'costo_unitario', 200),
    jsonb_build_object('producto_id', v_c, 'cantidad', 2,  'costo_unitario', 300)));

  perform pg_temp.comprobar(pg_temp.stock(v_a) = 10 and pg_temp.stock(v_b) = 4 and pg_temp.stock(v_c) = 2,
    'la mercadería no entró al stock con las cantidades de la factura');
  perform pg_temp.comprobar(
    (select count(*) = 3 from public.movimiento_stock
      where referencia_tipo = 'compra' and referencia_id = v_fa and tipo = 'compra'),
    'los movimientos no quedaron atados a la factura como compra');

  perform pg_temp.comprobar((select costo from public.producto where id = v_a) = 1210,
    'en una A el costo no quedó con el 21% sumado');
  perform pg_temp.comprobar((select costo from public.producto where id = v_b) = 221,
    'en una A el costo al 10,5% no quedó con su alícuota');
  perform pg_temp.comprobar((select costo from public.producto where id = v_c) = 300,
    'a un producto exento se le sumó IVA');

  perform pg_temp.comprobar((select precio_venta from public.producto where id = v_a) = 1500,
    'el precio de venta se movió solo al recibir');

  perform pg_temp.comprobar(
    (select (e->>'costo_anterior')::numeric = 1000 and (e->>'costo_nuevo')::numeric = 1210
            and (e->>'precio_sugerido')::numeric = 1694
       from jsonb_array_elements(v_r) e where (e->>'producto_id')::uuid = v_a),
    'lo que devuelve no trae el costo de antes, el de ahora y el precio sugerido');
  perform pg_temp.comprobar(
    (select e->'precio_sugerido' = 'null'::jsonb
       from jsonb_array_elements(v_r) e where (e->>'producto_id')::uuid = v_b),
    'sugirió un precio para un producto sin margen');

  perform pg_temp.comprobar(
    (select recibida_en is not null and recibida_por is not null from public.compra where id = v_fa),
    'la factura no quedó marcada como recibida');

  -- ─── 2. La misma factura no entra dos veces ───
  begin
    perform public.recibir_mercaderia(v_fa, jsonb_build_array(
      jsonb_build_object('producto_id', v_a, 'cantidad', 10, 'costo_unitario', 1000)));
    perform pg_temp.comprobar(false, 'se recibió dos veces la misma factura');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'La mercadería de esa factura ya se recibió%', sqlerrm);
  end;
  perform pg_temp.comprobar(pg_temp.stock(v_a) = 10, 'el segundo intento dejó stock');

  -- ─── 3. Factura B: el papel ya trae el precio final ───
  v_fb := pg_temp.factura(v_prov, 6::smallint, 102);
  perform public.recibir_mercaderia(v_fb, jsonb_build_array(
    jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 1300)));
  perform pg_temp.comprobar((select costo from public.producto where id = v_a) = 1300,
    'en una B se le sumó IVA a un costo que ya lo traía');

  -- ─── 4. Una nota de crédito no trae mercadería ───
  v_nc := pg_temp.factura(v_prov, 3::smallint, 103);
  begin
    perform public.recibir_mercaderia(v_nc, jsonb_build_array(
      jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 1)));
    perform pg_temp.comprobar(false, 'una nota de crédito sumó stock');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Una nota de crédito no trae mercadería%', sqlerrm);
  end;

  -- ─── 5. Un producto repetido se frena, y no queda nada a medias ───
  v_f0 := pg_temp.factura(v_prov, 1::smallint, 104);
  begin
    perform public.recibir_mercaderia(v_f0, jsonb_build_array(
      jsonb_build_object('producto_id', v_b, 'cantidad', 1, 'costo_unitario', 1),
      jsonb_build_object('producto_id', v_b, 'cantidad', 1, 'costo_unitario', 1)));
    perform pg_temp.comprobar(false, 'aceptó el mismo producto en dos renglones');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Hay un producto repetido%', sqlerrm);
  end;

  -- Un renglón malo en el medio deshace los buenos de antes.
  begin
    perform public.recibir_mercaderia(v_f0, jsonb_build_array(
      jsonb_build_object('producto_id', v_b, 'cantidad', 3, 'costo_unitario', 100),
      jsonb_build_object('producto_id', v_c, 'cantidad', 0, 'costo_unitario', 100)));
    perform pg_temp.comprobar(false, 'aceptó una cantidad en cero');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Cada renglón tiene que tener una cantidad%', sqlerrm);
  end;
  perform pg_temp.comprobar(pg_temp.stock(v_b) = 4 and (select costo from public.producto where id = v_b) = 221,
    'un renglón malo dejó a medias el stock o el costo de los anteriores');

  -- ─── 6. Un costo en cero entra el stock pero no pisa el costo ───
  perform public.recibir_mercaderia(v_f0, jsonb_build_array(
    jsonb_build_object('producto_id', v_b, 'cantidad', 1, 'costo_unitario', 0)));
  perform pg_temp.comprobar(pg_temp.stock(v_b) = 5 and (select costo from public.producto where id = v_b) = 221,
    'una bonificación sin costo dejó al producto con costo cero');

  -- ─── 7. El precio sugerido se aplica sólo a los elegidos, y sólo con margen ───
  v_n := public.aplicar_precio_sugerido(array[v_a, v_b]);
  perform pg_temp.comprobar(v_n = 1, 'aplicó precio a un producto sin margen');
  perform pg_temp.comprobar((select precio_venta from public.producto where id = v_a) = 1820,
    'el precio aplicado no es costo por margen (1300 + 40%)');
  perform pg_temp.comprobar((select precio_venta from public.producto where id = v_b) = 900,
    'cambió el precio de un producto sin margen');

  -- ─── 8. Dar de baja una factura recibida saca la mercadería ───
  perform public.anular_compra(v_fa, 'Prueba');
  perform pg_temp.comprobar(pg_temp.stock(v_a) = 1 and pg_temp.stock(v_b) = 1 and pg_temp.stock(v_c) = 0,
    'la baja de la factura no sacó del stock lo que había entrado');
  perform pg_temp.comprobar(
    (select count(*) = 3 from public.movimiento_stock
      where referencia_id = v_fa and tipo = 'ajuste' and cantidad < 0),
    'la baja no dejó un ajuste por renglón');
  perform pg_temp.comprobar((select costo from public.producto where id = v_a) = 1300,
    'la baja movió el costo');

  -- ─── 9. Sin cuenta no se recibe nada ───
  perform pg_temp.como(gen_random_uuid());
  begin
    perform public.recibir_mercaderia(v_f0, jsonb_build_array(
      jsonb_build_object('producto_id', v_a, 'cantidad', 1, 'costo_unitario', 1)));
    perform pg_temp.comprobar(false, 'alguien sin permiso recibió mercadería');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para recibir mercadería.', sqlerrm);
  end;
  begin
    perform public.aplicar_precio_sugerido(array[v_a]);
    perform pg_temp.comprobar(false, 'alguien sin permiso cambió un precio');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para cambiar precios.', sqlerrm);
  end;

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
