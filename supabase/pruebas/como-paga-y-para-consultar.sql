-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL MEDIO DE PAGO DEL PEDIDO Y DE LO «SÓLO PARA CONSULTAR»
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los pedidos entran por la misma función que usa la API; marcar «sólo
-- para consultar» y la pantalla Pedidos web se prueban como un usuario de
-- verdad, con las políticas de la base.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.pedido(p_numero text, p_pagado boolean, p_medio text, p_producto uuid)
returns json language sql as $$
  select app.registrar_pedido_de_la_tienda(app.canal_de_la_tienda(), jsonb_strip_nulls(jsonb_build_object(
    'numero', p_numero,
    'pagado', p_pagado,
    'medio_pago', p_medio,
    'comprador', jsonb_build_object('nombre', 'Comprador de Prueba', 'documento', '30111222'),
    'productos', jsonb_build_array(jsonb_build_object('id', p_producto, 'cantidad', 1, 'precio', 10000)))))
$$;

do $$
declare
  v_canal     uuid := app.canal_de_la_tienda();
  v_a         uuid;
  v_farmacia  uuid;
  v_r         json;
  v_pedido    public.pedido_tienda;
  v_venta     public.venta;
  v_transf    uuid;
  v_efectivo  uuid;
  v_catalogo  json;
  v_clave     text;
  v_admin     uuid;
  v_vendedor  uuid;
  v_n         integer;
  rechazado   boolean;
begin
  select id into v_transf from public.medio_pago where tipo = 'transferencia' and activo and eliminado_en is null order by orden limit 1;
  select id into v_efectivo from public.medio_pago where tipo = 'efectivo' and activo and eliminado_en is null order by orden limit 1;
  perform pg_temp.comprobar(v_transf is not null and v_efectivo is not null, 'hacen falta los medios Transferencia y Efectivo');

  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-MP-A', 'PRUEBA MP A', 'Producto para vender', 10000) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-MP-F', 'PRUEBA MP FARMACIA', 'Producto de farmacia', 10000) returning id into v_farmacia;
  insert into public.canal_producto (canal_id, producto_id, publicar)
    values (v_canal, v_a, true), (v_canal, v_farmacia, true);
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo)
    values (v_a, 'carga_inicial', 20, 'Prueba', 'manual'), (v_farmacia, 'carga_inicial', 20, 'Prueba', 'manual');

  -- ─── 1 a 3. Transferencia sin pagar: queda en la caja con el medio previsto ───
  v_r := pg_temp.pedido('PRUEBA-MP-1', false, 'transferencia', v_a);
  select * into v_pedido from public.pedido_tienda where numero_externo = 'PRUEBA-MP-1';
  select * into v_venta from public.venta where id = v_pedido.venta_id;
  perform pg_temp.comprobar(v_pedido.medio_pago = 'transferencia', 'el pedido no guardó el medio de pago');
  perform pg_temp.comprobar(v_venta.estado = 'en_caja' and v_venta.medio_pago_previsto_id = v_transf,
    'la transferencia sin pagar no llegó a la caja con Transferencia prevista');
  perform pg_temp.comprobar((v_r ->> 'revisar') is null, format('marcó una transferencia normal: %s', v_r ->> 'revisar'));

  -- ─── 4. Efectivo sin pagar: Efectivo previsto ───
  perform pg_temp.pedido('PRUEBA-MP-2', false, 'efectivo', v_a);
  perform pg_temp.comprobar(
    (select v.medio_pago_previsto_id from public.pedido_tienda p join public.venta v on v.id = p.venta_id
      where p.numero_externo = 'PRUEBA-MP-2') = v_efectivo,
    'el efectivo sin pagar no llegó a la caja con Efectivo previsto');

  -- ─── 5 y 6. Mercado Pago pagado: cobrado, sin marcas ───
  v_r := pg_temp.pedido('PRUEBA-MP-3', true, 'mercado_pago', v_a);
  select * into v_pedido from public.pedido_tienda where numero_externo = 'PRUEBA-MP-3';
  perform pg_temp.comprobar(v_pedido.medio_pago = 'mercado_pago' and v_pedido.pagado_en_la_web, 'Mercado Pago pagado no quedó guardado');
  perform pg_temp.comprobar((v_r ->> 'revisar') is null and (select estado from public.venta where id = v_pedido.venta_id) = 'cobrada',
    'Mercado Pago pagado no quedó cobrado y limpio');

  -- ─── 7. Mercado Pago sin pagar: entra, marcado ───
  v_r := pg_temp.pedido('PRUEBA-MP-4', false, 'mercado_pago', v_a);
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%Mercado Pago pero llegó sin pagar%',
    format('Mercado Pago sin pagar no quedó marcado: %s', v_r ->> 'revisar'));

  -- ─── 8. Un medio desconocido se rechaza ───
  begin
    perform pg_temp.pedido('PRUEBA-MP-5', true, 'bitcoin', v_a);
    rechazado := false;
  exception when others then
    rechazado := sqlerrm = 'medio_pago_invalido';
  end;
  perform pg_temp.comprobar(rechazado, 'un medio de pago desconocido no se rechazó con medio_pago_invalido');

  -- ─── 9. Sin medio, como hasta ahora ───
  perform pg_temp.pedido('PRUEBA-MP-6', true, null, v_a);
  perform pg_temp.comprobar(
    (select medio_pago is null and pagado_en_la_web from public.pedido_tienda where numero_externo = 'PRUEBA-MP-6'),
    'un pedido sin medio de pago dejó de entrar como antes');

  -- ─── 10 a 12. El estado que pregunta la tienda dice el medio ───
  v_clave := app.crear_clave_api(v_canal, 'Prueba del medio de pago');
  v_r := public.api_tienda_estado_pedido(v_clave, 'PRUEBA-MP-1');
  perform pg_temp.comprobar(v_r ->> 'medio_pago' = 'transferencia', format('el estado del pedido no dice el medio: %s', v_r));

  -- ─── Marcar sólo para consultar, como un usuario de verdad ───
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;
  -- Los vendedores entran con PIN y no tienen cuenta: sin permiso se prueba
  -- con una sesión que no es de ningún usuario del sistema.
  v_vendedor := gen_random_uuid();
  perform pg_temp.comprobar(v_admin is not null, 'hace falta un Administrador con cuenta');

  perform set_config('request.jwt.claims', json_build_object('sub', v_vendedor, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.definir_solo_consultar(array[v_farmacia], true);
    rechazado := false;
  exception when others then
    rechazado := sqlerrm like '%permiso%';
  end;
  perform pg_temp.comprobar(rechazado, 'una sesión sin permiso pudo marcar un producto sólo para consultar');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_n := public.definir_solo_consultar(array[v_farmacia], true);
  perform pg_temp.comprobar(v_n = 1, format('marcar tenía que cambiar 1 y cambió %s', v_n));
  v_n := public.definir_solo_consultar(array[v_farmacia], true);
  perform pg_temp.comprobar(v_n = 0, 'marcar lo ya marcado contó como un cambio');
  perform pg_temp.comprobar(
    (select solo_consultar and motivo is null from public.estado_en_tienda(array[v_farmacia])),
    'la ficha no ve el producto como publicado y sólo para consultar');
  perform pg_temp.comprobar(
    (select medio_pago from public.pedidos_web('por_preparar') where numero = 'PRUEBA-MP-1') = 'transferencia',
    'la pantalla Pedidos web no trae el medio de pago');
  perform set_config('role', 'postgres', true);

  -- ─── 13 y 14. El catálogo lo dice ───
  v_catalogo := app.catalogo_de_canal(v_canal, null, 1000, clock_timestamp() + interval '1 second');
  perform pg_temp.comprobar(
    (select (e ->> 'solo_consultar')::boolean from json_array_elements(v_catalogo -> 'productos') e
      where e ->> 'id' = v_farmacia::text),
    'el catálogo no dice que el de farmacia es sólo para consultar');
  perform pg_temp.comprobar(
    (select not (e ->> 'solo_consultar')::boolean from json_array_elements(v_catalogo -> 'productos') e
      where e ->> 'id' = v_a::text),
    'el catálogo no dice que el otro sí se vende');

  -- ─── 15. Si igual lo compran, entra marcado ───
  v_r := pg_temp.pedido('PRUEBA-MP-7', true, 'mercado_pago', v_farmacia);
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%PRUEBA-MP-F es sólo para consultar%',
    format('un pedido con un producto para consultar no quedó marcado: %s', v_r ->> 'revisar'));

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
