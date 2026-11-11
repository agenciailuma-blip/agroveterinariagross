-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL COBRO QUE LLEGA TARDE Y DEL STOCK POR PUESTO,
-- CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Va con 20261111120000_cobro_tardio_y_stock_por_puesto.sql. Arma
-- ventas de prueba en un mostrador, las cobra contra una caja cerrada y
-- usa un PIN de prueba de ocho cifras para abrir la caja.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Una venta en borrador, armada en el mostrador y ya pagada en efectivo.
create function pg_temp.venta(p_codigo text, p_mostrador uuid, p_vendedor uuid)
returns uuid language plpgsql as $$
declare v uuid; v_prod public.producto;
begin
  select * into v_prod from public.producto where eliminado_en is null and activo order by codigo limit 1;
  insert into public.venta (codigo, cliente_id, estado, documentacion, terminal_origen_id, vendedor_id)
  values (p_codigo, (select id from public.cliente where eliminado_en is null order by codigo limit 1),
          'borrador', 'no_fiscal', p_mostrador, p_vendedor) returning id into v;
  insert into public.venta_linea (venta_id, producto_id, codigo_producto, descripcion, cantidad,
    precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva)
  values (v, v_prod.id, v_prod.codigo, 'Prueba cobro tardío', 1, 1000, 1000, 1000, 5, 'gravado');
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (v, (select id from public.medio_pago where tipo = 'efectivo' and eliminado_en is null limit 1),
          (select total from public.venta where id = v));
  return v;
end $$;

do $$
declare
  v_mostrador uuid;
  v_caja_pc   uuid;
  v_encargado uuid;
  v_auth      uuid;
  v_cerrada   uuid;
  v_abierta   uuid;
  v_venta     uuid;
  v_venta2    uuid;
  r           json;
  v_res       jsonb;
begin
  select id into v_mostrador from public.terminal where tipo <> 'caja' and eliminado_en is null order by nombre limit 1;
  select id into v_caja_pc from public.terminal where tipo = 'caja' and eliminado_en is null order by nombre limit 1;
  select u.id into v_encargado from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Encargado' and u.activo and u.eliminado_en is null limit 1;
  select id into v_cerrada from public.caja where estado = 'cerrada' order by cerrada_en desc limit 1;
  perform pg_temp.comprobar(v_mostrador is not null and v_encargado is not null and v_cerrada is not null,
    'hace falta un mostrador, un Encargado y una caja cerrada');

  -- Que haya una caja abierta en una PC de caja.
  select id into v_abierta from public.caja where estado = 'abierta' order by abierta_en desc limit 1;
  if v_abierta is null then
    insert into public.caja (terminal_id, cajero_id, monto_inicial) values (v_caja_pc, v_encargado, 0)
    returning id into v_abierta;
  end if;

  -- 1. La venta del mostrador nace en borrador: no está en la cola.
  v_venta := pg_temp.venta('PRUEBA-TARDE-1', v_mostrador, v_encargado);
  perform pg_temp.comprobar((select estado = 'borrador' from public.venta where id = v_venta),
    'la venta del mostrador no quedó en borrador');

  -- 2. Si se cancela el cobro, pasa a la cola.
  perform public.mandar_venta_a_caja(v_venta);
  perform pg_temp.comprobar(
    (select estado = 'en_caja' and enviada_caja_en is not null from public.venta where id = v_venta),
    'cancelar el cobro no la pasó a la cola');

  -- 3. Cobrada sin conexión contra una caja que ya se cerró: va a la abierta.
  perform public.cobrar_venta(v_venta, v_cerrada, v_encargado);
  perform pg_temp.comprobar(
    (select estado = 'cobrada' and caja_id = v_abierta and caja_original_id = v_cerrada from public.venta where id = v_venta),
    'el cobro tardío no fue a la caja abierta');

  -- 4. El stock sale como del mostrador, no de la PC de la caja.
  perform pg_temp.comprobar(
    (select bool_and(terminal_id = v_mostrador) from public.movimiento_stock
      where referencia_tipo = 'venta' and referencia_id = v_venta),
    'el stock no quedó a nombre del mostrador');

  -- 5. Ya cobrada, mandarla a la cola no la toca.
  perform public.mandar_venta_a_caja(v_venta);
  perform pg_temp.comprobar((select estado = 'cobrada' from public.venta where id = v_venta),
    'una venta cobrada volvió a la cola');

  -- 6. El resumen de la caja abierta dice que entró una de una caja cerrada.
  insert into app.usuario_pin (usuario_id, pin_hash)
  values (v_encargado, extensions.crypt('90817263', extensions.gen_salt('bf')))
  on conflict (usuario_id) do update set pin_hash = excluded.pin_hash, intentos = 0, bloqueado_hasta = null;
  select u.auth_user_id into v_auth from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;
  delete from app.intento_pin where auth_user_id = v_auth;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_res := public.resumen_de_caja(v_abierta);
  perform pg_temp.comprobar((v_res->'ventas'->'de_una_caja_cerrada'->>'cantidad')::integer >= 1,
    'el resumen no dice que entró una venta de una caja cerrada');

  -- 7. Sin ninguna caja abierta, el cobro tardío queda esperando…
  perform set_config('role', 'postgres', true);
  update public.caja set estado = 'cerrada', cerrada_en = now(), monto_declarado = 0 where estado = 'abierta';
  v_venta2 := pg_temp.venta('PRUEBA-TARDE-2', v_mostrador, v_encargado);
  perform public.cobrar_venta(v_venta2, v_cerrada, v_encargado);
  perform pg_temp.comprobar(
    (select estado = 'cobrada' and caja_id is null and caja_original_id = v_cerrada from public.venta where id = v_venta2),
    'sin caja abierta, el cobro tardío no quedó esperando');

  -- 8. …y la toma la próxima caja que se abre.
  perform set_config('role', 'authenticated', true);
  r := public.abrir_caja(v_caja_pc, 0, '90817263');
  perform pg_temp.comprobar((r->>'ok')::boolean, 'no se pudo abrir: ' || coalesce(r->>'error', ''));
  perform pg_temp.comprobar((r->>'ventas_tomadas')::integer >= 1, 'abrir no tomó el cobro que esperaba');
  perform pg_temp.comprobar(
    (select caja_id = (r->'caja'->>'id')::uuid from public.venta where id = v_venta2),
    'el cobro que esperaba no quedó en la caja nueva');

  -- 9. Un cobro normal, contra la caja abierta, no se marca.
  perform set_config('role', 'postgres', true);
  v_venta := pg_temp.venta('PRUEBA-TARDE-3', v_mostrador, v_encargado);
  perform public.cobrar_venta(v_venta, (r->'caja'->>'id')::uuid, v_encargado);
  perform pg_temp.comprobar(
    (select caja_id = (r->'caja'->>'id')::uuid and caja_original_id is null from public.venta where id = v_venta),
    'un cobro normal quedó marcado como tardío');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
