-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA ORDEN DE COMPRA INTERNA, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador, como un Vendedor —un administrador al que
-- se le cambia el rol adentro de la misma transacción, que se deshace— y
-- como alguien sin cuenta.
--
-- Lo que se cuida: que la orden guarde lo que dice el papel, que se
-- pueda corregir mientras está pendiente y no después, que el vendedor
-- pueda pedir pero no marcar como pedido, y que nadie escriba las
-- tablas por fuera de las funciones.
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

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

do $$
declare
  v_admin     uuid;
  v_vend_auth uuid;
  v_deposito  uuid;
  v_compras   uuid;
  v_taller    uuid;
  v_prov_a    uuid;
  v_prov_b    uuid;
  v_p1        uuid;
  v_p2        uuid;
  v_cliente   uuid;
  v_orden     uuid := gen_random_uuid();
  v_otra      uuid := gen_random_uuid();
  v_n         bigint;
  v_n2        bigint;
  v_doc       jsonb;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  order by u.creado_en limit 1;
  select u.auth_user_id into v_vend_auth
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
    and u.auth_user_id <> v_admin
  limit 1;
  perform pg_temp.comprobar(v_admin is not null and v_vend_auth is not null, 'hacen falta dos usuarios con cuenta para probar');

  -- ─── 0. Todos los puestos pueden pedir ───
  perform pg_temp.comprobar(
    (select count(*) = (select count(*) from public.rol) from public.rol_permiso where permiso_clave = 'compras.solicitar'),
    'no todos los puestos tienen el permiso de hacer órdenes internas');

  -- ─── Datos de prueba ───
  insert into public.proveedor (nombre) values ('PRUEBA OCI ZETA') returning id into v_prov_a;
  insert into public.proveedor (nombre) values ('PRUEBA OCI ALFA') returning id into v_prov_b;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, proveedor_id)
    values ('PRUEBA-OCI-1', 'PRUEBA OCI ALIMENTO 15KG', 100, 5, v_prov_a) returning id into v_p1;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, proveedor_id)
    values ('PRUEBA-OCI-2', 'PRUEBA OCI PIPETA', 100, 5, v_prov_b) returning id into v_p2;
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, telefono)
    values ('PRUEBA OCI CLIENTE', 5, 96, '99999997', '3755 123456') returning id into v_cliente;

  perform pg_temp.como(v_admin);
  perform set_config('role', 'authenticated', true);

  -- ─── 1. Los sectores ───
  select id into v_deposito from public.sector where nombre = 'Depósito';
  select id into v_compras from public.sector where nombre = 'Compras';
  perform pg_temp.comprobar(v_deposito is not null and v_compras is not null
                            and (select count(*) >= 6 from public.sector),
    'no están los sectores del dibujo de Lucas');
  perform pg_temp.comprobar(public.crear_sector('  depósito ') = v_deposito,
    'sumar un sector que ya está, escrito distinto, creó otro');
  v_taller := public.crear_sector('PRUEBA Taller');
  perform pg_temp.comprobar(v_taller is not null and v_taller <> v_deposito, 'no se pudo sumar un sector nuevo');

  -- ─── 2. La orden, como el papel ───
  v_n := public.guardar_orden_interna(v_orden, v_deposito, v_compras, jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'proveedor_id', v_prov_a, 'cantidad', 5),
      jsonb_build_object('producto_id', v_p2, 'descripcion', 'Pipeta, la de perro grande', 'proveedor_id', v_prov_b, 'cantidad', 3),
      jsonb_build_object('descripcion', 'Precintos de Casa Burgo', 'cantidad', 2)),
    current_date, '  Urgente: para el 5 de marzo  ', v_cliente, '3755 123456');
  perform pg_temp.comprobar(v_n is not null, 'la orden no quedó numerada');
  perform pg_temp.comprobar(
    (select estado = 'pendiente' and observacion = 'Urgente: para el 5 de marzo' and creada_por is not null
            and contacto = '3755 123456' and cliente_id = v_cliente
       from public.orden_compra_interna where id = v_orden),
    'la cabecera no quedó como se cargó');
  perform pg_temp.comprobar(
    (select count(*) = 3
            and count(*) filter (where codigo = 'PRUEBA-OCI-1' and descripcion = 'PRUEBA OCI ALIMENTO 15KG') = 1
            and count(*) filter (where codigo = 'PRUEBA-OCI-2' and descripcion = 'Pipeta, la de perro grande') = 1
            and count(*) filter (where producto_id is null and codigo is null and descripcion = 'Precintos de Casa Burgo') = 1
       from public.orden_compra_interna_linea where orden_id = v_orden),
    'los renglones no guardaron el código y la descripción, o el renglón libre');

  v_doc := public.orden_interna(v_orden);
  perform pg_temp.comprobar(v_doc->>'emite' = 'Depósito' and v_doc->>'recibe' = 'Compras'
                            and v_doc->>'cliente' = 'PRUEBA OCI CLIENTE' and (v_doc->>'numero')::bigint = v_n,
    'la orden para ver o imprimir no trae los nombres');
  perform pg_temp.comprobar(
    (v_doc->'lineas'->0->>'proveedor') = 'PRUEBA OCI ALFA' and (v_doc->'lineas'->1->>'proveedor') = 'PRUEBA OCI ZETA'
    and (v_doc->'lineas'->2->>'proveedor') is null,
    'los renglones no vienen ordenados por proveedor, con lo que no tiene proveedor al final');

  -- ─── 3. Pendiente se corrige; el mismo guardado no duplica ───
  v_n2 := public.guardar_orden_interna(v_orden, v_taller, v_compras, jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'proveedor_id', v_prov_a, 'cantidad', 8)));
  perform pg_temp.comprobar(v_n2 = v_n, 'corregir la orden le cambió el número');
  perform pg_temp.comprobar(
    (select count(*) = 1 and sum(cantidad) = 8 from public.orden_compra_interna_linea where orden_id = v_orden)
    and (select emite_id = v_taller and observacion is null from public.orden_compra_interna where id = v_orden)
    and (select count(*) = 1 from public.orden_compra_interna where id = v_orden),
    'corregir la orden no reemplazó la cabecera y los renglones');

  -- ─── 4. Lo que no se puede guardar ───
  perform pg_temp.falla(format('select public.guardar_orden_interna(gen_random_uuid(), %L, %L, %L)', v_deposito, v_compras, '[]'),
    'La orden no tiene nada para pedir.', 'se guardó una orden vacía');
  perform pg_temp.falla(format('select public.guardar_orden_interna(gen_random_uuid(), %L, %L, %L)', gen_random_uuid(), v_compras,
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1))),
    'Falta elegir qué sector la emite.', 'se guardó una orden sin sector que la emita');
  perform pg_temp.falla(format('select public.guardar_orden_interna(gen_random_uuid(), %L, %L, %L)', v_deposito, v_compras,
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 0))),
    'Al renglón 1 («PRUEBA OCI ALIMENTO 15KG») le falta la cantidad.', 'se guardó un renglón sin cantidad');
  perform pg_temp.falla(format('select public.guardar_orden_interna(gen_random_uuid(), %L, %L, %L)', v_deposito, v_compras,
      jsonb_build_array(jsonb_build_object('descripcion', '   ', 'cantidad', 1))),
    'Al renglón 1 le falta qué hay que comprar.', 'se guardó un renglón libre sin decir qué');

  -- ─── 5. Pedida: ya no se toca ───
  perform public.marcar_orden_interna(v_orden, true);
  perform pg_temp.comprobar(
    (select estado = 'pedida' and pedida_por is not null and pedida_en is not null from public.orden_compra_interna where id = v_orden),
    'marcarla pedida no dejó quién y cuándo');
  perform pg_temp.falla(format('select public.guardar_orden_interna(%L, %L, %L, %L)', v_orden, v_deposito, v_compras,
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1))),
    'La orden % ya está pedida: no se puede cambiar.', 'se cambió una orden ya pedida');
  perform pg_temp.falla(format('select public.anular_orden_interna(%L, %L)', v_orden, 'x'),
    'La orden % ya se pidió: primero hay que volverla a pendiente.', 'se anuló una orden ya pedida');
  perform public.marcar_orden_interna(v_orden, false);
  perform pg_temp.comprobar(
    (select estado = 'pendiente' and pedida_por is null from public.orden_compra_interna where id = v_orden),
    'volverla a pendiente no deshizo el pedido');
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.ordenes_internas('pendiente') where id = v_orden)
    and (select count(*) = 0 from public.ordenes_internas('pedida') where id = v_orden),
    'la lista no filtra por estado');

  -- ─── 6. Anular, con motivo ───
  perform pg_temp.falla(format('select public.anular_orden_interna(%L, %L)', v_orden, '  '),
    'Para anular una orden hay que decir por qué.', 'se anuló sin motivo');
  perform public.anular_orden_interna(v_orden, 'Ya llegó por otro lado');
  perform pg_temp.comprobar(
    (select estado = 'anulada' and motivo_anulacion = 'Ya llegó por otro lado' and anulada_por is not null
       from public.orden_compra_interna where id = v_orden),
    'la anulación no quedó con su motivo');
  perform pg_temp.falla(format('select public.marcar_orden_interna(%L, true)', v_orden),
    'La orden % está anulada.', 'se marcó pedida una orden anulada');

  -- ─── 7. El vendedor pide, pero no marca pedido ───
  reset role;
  update public.usuario set rol_id = (select id from public.rol where nombre = 'Vendedor')
   where auth_user_id = v_vend_auth;
  perform pg_temp.como(v_vend_auth);
  perform set_config('role', 'authenticated', true);
  v_n := public.guardar_orden_interna(v_otra, v_deposito, v_compras,
    jsonb_build_array(jsonb_build_object('producto_id', v_p2, 'proveedor_id', v_prov_b, 'cantidad', 1)));
  perform pg_temp.comprobar(v_n is not null, 'el vendedor no pudo hacer una orden interna');
  perform pg_temp.comprobar((select count(*) >= 2 from public.ordenes_internas()),
    'el vendedor no ve las órdenes de los demás');
  perform pg_temp.falla(format('select public.marcar_orden_interna(%L, true)', v_otra),
    'Marcar una orden como pedida es de quien compra.', 'el vendedor marcó una orden como pedida');
  perform pg_temp.falla(format('insert into public.orden_compra_interna (emite_id, recibe_id) values (%L, %L)', v_deposito, v_compras),
    '%row-level security%', 'se escribió una orden por fuera de la función');

  -- ─── 8. Sin cuenta, nada ───
  perform pg_temp.como(gen_random_uuid());
  perform pg_temp.falla(format('select public.guardar_orden_interna(gen_random_uuid(), %L, %L, %L)', v_deposito, v_compras,
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1))),
    'No tenés permiso para hacer órdenes de compra internas.', 'alguien sin cuenta hizo una orden');
  perform pg_temp.falla('select * from public.ordenes_internas()',
    'No tenés permiso para ver las órdenes de compra internas.', 'alguien sin cuenta vio las órdenes');
  perform pg_temp.falla('select public.crear_sector(''Otro'')',
    'No tenés permiso para hacer órdenes de compra internas.', 'alguien sin cuenta sumó un sector');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
