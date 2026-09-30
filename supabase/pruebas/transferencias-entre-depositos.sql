-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LOS DEPÓSITOS Y LAS TRANSFERENCIAS, CONTRA LA BASE REAL
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
-- Lo que se cuida: que el total no se mueva al transferir, que cada
-- máquina descuente de su depósito, que lo que vuelve vuelva adonde
-- salió, que la toma de un depósito no toque el otro, y que un depósito
-- con mercadería no se pueda dar de baja.
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
exception when raise_exception then
  perform pg_temp.comprobar(sqlerrm like p_mensaje, p_que || ' — dijo: ' || sqlerrm);
end $$;

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.en(p_producto uuid, p_deposito uuid)
returns numeric language sql as $$
  select coalesce((select cantidad from public.stock_deposito
                    where producto_id = p_producto and deposito_id = p_deposito), 0)
$$;

create function pg_temp.total(p_producto uuid)
returns numeric language sql as $$
  select coalesce((select cantidad from public.stock_saldo where producto_id = p_producto), 0)
$$;

create function pg_temp.lineas(p_producto uuid, p_cantidad numeric)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('producto_id', p_producto, 'cantidad', p_cantidad))
$$;

do $$
declare
  v_admin     uuid;
  v_principal uuid;
  v_d2        uuid;
  v_a         uuid;
  v_b         uuid;
  v_prov      uuid;
  v_t         uuid := gen_random_uuid();
  v_t2        uuid := gen_random_uuid();
  v_ref       uuid := gen_random_uuid();
  v_n         bigint;
  v_mos       uuid;
  v_caja      uuid;
  v_toma      uuid;
  v_toma2     uuid;
  v_fa        uuid;
  v_fb        uuid;
  v_x         numeric;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  v_principal := app.deposito_principal();

  -- ─── 0. El saldo de cada depósito arranca igual al libro ───
  perform pg_temp.comprobar(not exists (
      select 1
        from (select producto_id, deposito_id, sum(cantidad) as c
                from public.movimiento_stock group by 1, 2) m
        full join public.stock_deposito s using (producto_id, deposito_id)
       where coalesce(m.c, 0) <> coalesce(s.cantidad, 0)),
    'el saldo de cada depósito no coincide con la suma del libro');
  perform pg_temp.comprobar(not exists (
      select 1
        from public.stock_saldo t
        left join (select producto_id, sum(cantidad) as c from public.stock_deposito group by 1) s using (producto_id)
       where t.cantidad <> coalesce(s.c, 0)),
    'la suma de los depósitos no da el total de cada producto');

  -- ─── Datos de prueba ───
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id)
    values ('PRUEBA-DEP-A', 'PRUEBA DEP A', 1000, 5) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id)
    values ('PRUEBA-DEP-B', 'PRUEBA DEP B', 500, 5) returning id into v_b;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (v_a, 'carga_inicial', 10, 'manual'), (v_b, 'carga_inicial', 4, 'manual');
  insert into public.deposito (nombre) values ('PRUEBA Depósito 2') returning id into v_d2;
  insert into public.proveedor (nombre) values ('PRUEBA DEPÓSITOS') returning id into v_prov;
  select id into v_caja from public.terminal
   where deposito_id is null and activo and eliminado_en is null limit 1;

  perform pg_temp.comprobar(pg_temp.en(v_a, v_principal) = 10,
    'la carga sin depósito no entró en el principal');

  -- De acá en adelante, como un usuario de verdad.
  perform set_config('role', 'authenticated', true);

  -- ─── 1. Transferir: sale de uno, entra en el otro, el total no se mueve ───
  v_n := public.registrar_transferencia(v_t, v_principal, v_d2, jsonb_build_array(
    jsonb_build_object('producto_id', v_a, 'cantidad', 3),
    jsonb_build_object('producto_id', v_b, 'cantidad', 1.5)), '  para el local 2  ');

  perform pg_temp.comprobar(pg_temp.en(v_a, v_principal) = 7 and pg_temp.en(v_a, v_d2) = 3,
    'la transferencia no sacó del origen y puso en el destino');
  perform pg_temp.comprobar(pg_temp.en(v_b, v_d2) = 1.5, 'no se pudo transferir una cantidad con decimales');
  perform pg_temp.comprobar(pg_temp.total(v_a) = 10 and pg_temp.total(v_b) = 4,
    'la transferencia movió el total');
  perform pg_temp.comprobar(
    (select count(*) = 4 from public.movimiento_stock
      where referencia_tipo = 'transferencia' and referencia_id = v_t and tipo = 'transferencia'),
    'no quedaron las dos puntas de cada producto en el libro');
  perform pg_temp.comprobar(
    (select observacion = 'para el local 2' and numero = v_n from public.transferencia where id = v_t),
    'la transferencia no quedó con su número y la observación limpia');

  -- El mismo guardado dos veces no mueve dos veces.
  perform pg_temp.comprobar(public.registrar_transferencia(v_t, v_principal, v_d2, pg_temp.lineas(v_a, 3)) = v_n,
    'repetir el guardado no devolvió el mismo número');
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 3, 'repetir el guardado transfirió dos veces');

  -- ─── 2. Lo que no se puede ───
  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_d2, v_d2, pg_temp.lineas(v_a, 1)),
    'El origen y el destino son el mismo depósito.', 'se transfirió de un depósito a sí mismo');
  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_principal, v_d2, '[]'),
    'No hay nada para transferir.', 'se registró una transferencia vacía');
  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_principal, v_d2, pg_temp.lineas(v_a, 1) || pg_temp.lineas(v_a, 2)),
    'Hay un producto repetido%', 'se aceptó un producto repetido');
  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_principal, v_d2, pg_temp.lineas(v_a, 0)),
    'Cada renglón tiene que tener una cantidad mayor que cero.', 'se transfirió una cantidad en cero');
  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_principal, gen_random_uuid(), pg_temp.lineas(v_a, 1)),
    'El depósito de destino no existe%', 'se transfirió a un depósito que no existe');
  perform pg_temp.comprobar(pg_temp.en(v_a, v_principal) = 7 and pg_temp.en(v_a, v_d2) = 3,
    'una transferencia rechazada dejó movimientos a medias');

  -- ─── 3. La máquina del segundo local descuenta del segundo local ───
  v_mos := public.crear_terminal('PRUEBA Mostrador Local 2', 'mostrador', 'PDEP9');
  perform public.asignar_deposito_terminal(v_mos, v_d2);

  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo, referencia_id, terminal_id)
    values (v_a, 'venta', -1, 'venta', v_ref, v_mos);
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 2 and pg_temp.en(v_a, v_principal) = 7,
    'la venta de una máquina del segundo local no descontó de su depósito');

  -- Una máquina sin depósito elegido vende del principal.
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo, referencia_id, terminal_id)
    values (v_a, 'venta', -1, 'venta', gen_random_uuid(), v_caja);
  perform pg_temp.comprobar(pg_temp.en(v_a, v_principal) = 6,
    'una máquina sin depósito elegido no vendió del principal');

  -- ─── 4. Lo que vuelve, vuelve adonde salió ───
  -- La anulación se escribe sin máquina, como la escribe anular_venta.
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo, referencia_id)
    values (v_a, 'devolucion', 1, 'venta', v_ref);
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 3 and pg_temp.en(v_a, v_principal) = 6,
    'la anulación de una venta del segundo local reingresó en el principal');

  -- Sin máquina ni documento: el principal, como siempre.
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (v_a, 'ajuste', 1, 'manual');
  perform pg_temp.comprobar(pg_temp.en(v_a, v_principal) = 7,
    'un ajuste sin máquina ni documento no fue al principal');

  -- ─── 5. Anular una transferencia ───
  perform pg_temp.falla(format('select public.anular_transferencia(%L, %L)', v_t, '   '),
    'Para anular una transferencia hay que decir por qué.', 'se anuló una transferencia sin motivo');

  perform public.anular_transferencia(v_t, 'Prueba');
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 0 and pg_temp.en(v_a, v_principal) = 10
                            and pg_temp.en(v_b, v_d2) = 0 and pg_temp.en(v_b, v_principal) = 4,
    'anular no devolvió la mercadería al origen');
  perform pg_temp.comprobar(
    (select anulada_en is not null and motivo_anulacion = 'Prueba' from public.transferencia where id = v_t),
    'la transferencia anulada no quedó marcada con su motivo');
  perform pg_temp.comprobar(
    (select count(*) = 8 from public.movimiento_stock where referencia_id = v_t),
    'la anulación no escribió las dos puntas al revés');
  perform pg_temp.falla(format('select public.anular_transferencia(%L, %L)', v_t, 'otra vez'),
    'La transferencia % ya estaba anulada.', 'se anuló dos veces la misma transferencia');

  -- ─── 6. Un depósito se da de baja vacío y sin máquinas ───
  perform public.registrar_transferencia(v_t2, v_principal, v_d2, pg_temp.lineas(v_a, 5));
  perform pg_temp.falla(format('update public.deposito set activo = false where id = %L', v_d2),
    '«PRUEBA Depósito 2» todavía tiene stock de 1 producto(s)%', 'se dio de baja un depósito con mercadería');

  -- ─── 7. La toma de inventario es de un depósito ───
  insert into public.inventario (nombre, deposito_id, abierto_por)
    values ('PRUEBA toma local 2', v_d2, app.usuario_actual_id()) returning id into v_toma;
  v_x := public.registrar_conteo(v_toma, v_a, 4);
  perform pg_temp.comprobar(v_x = 5,
    'el conteo se comparó contra el total y no contra el depósito de la toma (dijo ' || v_x || ')');
  perform public.cerrar_inventario(v_toma);
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 4 and pg_temp.en(v_a, v_principal) = 5,
    'cerrar la toma del segundo local tocó el principal');
  perform pg_temp.comprobar(pg_temp.total(v_a) = 9, 'el ajuste de la toma no movió el total en lo que faltaba');
  perform pg_temp.falla(format('update public.inventario set deposito_id = %L where id = %L', v_principal, v_toma),
    'La toma ya tiene productos contados%', 'se le cambió el depósito a una toma con conteos');

  insert into public.inventario (nombre, abierto_por)
    values ('PRUEBA toma sin depósito', app.usuario_actual_id()) returning id into v_toma2;
  perform pg_temp.comprobar((select deposito_id = v_principal from public.inventario where id = v_toma2),
    'una toma abierta sin decir depósito no quedó en el principal');

  -- ─── 8. La recepción entra en el depósito elegido ───
  v_fa := public.registrar_compra(v_prov, 1::smallint, 7, 901, current_date, 0, 0, null,
    jsonb_build_array(jsonb_build_object('alicuota_iva_id', 5, 'base_imponible', 1000, 'importe', 210)));
  perform public.recibir_mercaderia(v_fa, jsonb_build_array(
    jsonb_build_object('producto_id', v_a, 'cantidad', 6, 'costo_unitario', 100)), v_d2);
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 10, 'la recepción no entró en el depósito elegido');

  -- Dar de baja la factura saca de donde entró, no del principal.
  perform public.anular_compra(v_fa, 'Prueba');
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 4 and pg_temp.en(v_a, v_principal) = 5,
    'la baja de la factura sacó la mercadería de otro depósito');

  -- Como la llaman las PC con la versión anterior: sin depósito, al principal.
  v_fb := public.registrar_compra(v_prov, 1::smallint, 7, 902, current_date, 0, 0, null,
    jsonb_build_array(jsonb_build_object('alicuota_iva_id', 5, 'base_imponible', 1000, 'importe', 210)));
  perform public.recibir_mercaderia(v_fb, jsonb_build_array(
    jsonb_build_object('producto_id', v_b, 'cantidad', 2, 'costo_unitario', 100)));
  perform pg_temp.comprobar(pg_temp.en(v_b, v_principal) = 6, 'la recepción sin depósito no entró en el principal');

  -- ─── 9. Lo que se mira ───
  perform pg_temp.comprobar(
    (select count(*) = 2 and sum(cantidad) = 9 from public.stock_por_deposito(array[v_a])),
    'el stock por depósito no devolvió un renglón por depósito con su cantidad');
  perform pg_temp.comprobar(
    (select cantidad = 4 and estado in ('critico', 'bajo', 'ok') from public.vista_stock_por_deposito
      where producto_id = v_a and deposito_id = v_d2),
    'la vista por depósito no muestra la cantidad del depósito');
  perform pg_temp.comprobar(
    (select productos = 1 and unidades = 5 and origen is not null and destino = 'PRUEBA Depósito 2'
       from public.vista_transferencia where id = v_t2),
    'la lista de transferencias no cuenta productos y unidades');
  perform pg_temp.comprobar(
    (select deposito = 'PRUEBA Depósito 2' from public.vista_inventario where id = v_toma),
    'la lista de tomas no dice de qué depósito es cada una');

  -- ─── 10. La baja, cuando se vacía ───
  -- Lo que quedó en el segundo local se lleva de vuelta.
  perform public.registrar_transferencia(gen_random_uuid(), v_d2, v_principal, pg_temp.lineas(v_a, 4));
  perform pg_temp.comprobar(pg_temp.en(v_a, v_d2) = 0, 'no se pudo vaciar el depósito');

  perform pg_temp.falla(format('update public.deposito set activo = false where id = %L', v_d2),
    '«PRUEBA Depósito 2» es el depósito de PRUEBA Mostrador Local 2%', 'se dio de baja el depósito de una máquina');
  perform public.asignar_deposito_terminal(v_mos, null);
  update public.deposito set activo = false where id = v_d2;
  perform pg_temp.comprobar((select not activo from public.deposito where id = v_d2),
    'un depósito vacío y sin máquinas no se pudo dar de baja');

  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_principal, v_d2, pg_temp.lineas(v_a, 1)),
    'El depósito de destino no existe o está dado de baja.', 'se transfirió a un depósito dado de baja');
  perform pg_temp.falla(format('select public.asignar_deposito_terminal(%L, %L)', v_mos, v_d2),
    'Ese depósito no existe o está dado de baja.', 'se le asignó a una máquina un depósito dado de baja');

  -- ─── 11. Sin cuenta no se mueve nada ───
  perform pg_temp.como(gen_random_uuid());
  perform pg_temp.falla(format('select public.registrar_transferencia(gen_random_uuid(), %L, %L, %L)',
      v_principal, v_d2, pg_temp.lineas(v_a, 1)),
    'No tenés permiso para mover mercadería entre depósitos.', 'alguien sin permiso transfirió');
  perform pg_temp.falla(format('select public.anular_transferencia(%L, %L)', v_t2, 'x'),
    'No tenés permiso para anular transferencias.', 'alguien sin permiso anuló una transferencia');
  perform pg_temp.falla(format('select public.asignar_deposito_terminal(%L, null)', v_mos),
    'No tenés permiso para modificar cajas ni mostradores.', 'alguien sin permiso le cambió el depósito a una máquina');
  perform pg_temp.comprobar((select count(*) = 0 from public.stock_por_deposito(array[v_a])),
    'alguien sin permiso vio el stock de cada depósito');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
