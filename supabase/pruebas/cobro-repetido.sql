-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL COBRO QUE LLEGA REPETIDO, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Va con 20261127120000_el_cobro_repetido_se_da_por_recibido.sql.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Una venta en borrador, ya pagada en efectivo.
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
  values (v, v_prod.id, v_prod.codigo, 'Prueba cobro repetido', 1, 1000, 1000, 1000, 5, 'gravado');
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (v, (select id from public.medio_pago where tipo = 'efectivo' and eliminado_en is null limit 1),
          (select total from public.venta where id = v));
  return v;
end $$;

do $$
declare
  v_mostrador uuid;
  v_vendedor  uuid;
  v_venta     uuid;
  v_antes     timestamptz;
  v_movs      integer;
  v_error     text;
  v_cliente   uuid;
  v_percepcion numeric;
begin
  select id into v_mostrador from public.terminal where tipo <> 'caja' and eliminado_en is null order by nombre limit 1;
  select id into v_vendedor from public.usuario where activo and eliminado_en is null limit 1;

  v_venta := pg_temp.venta('PRUEBA-REPETIDO-1', v_mostrador, v_vendedor);
  perform public.cobrar_venta(v_venta, null, v_vendedor);
  select cobrada_en into v_antes from public.venta where id = v_venta;
  select count(*) into v_movs from public.movimiento_stock where referencia_id = v_venta;

  -- 1. El mismo cobro otra vez: contesta bien…
  perform pg_temp.comprobar(public.cobrar_venta(v_venta, null, v_vendedor) = v_venta,
    'el cobro repetido no se dio por recibido');
  -- 2. …y no toca nada.
  perform pg_temp.comprobar(
    (select count(*) = v_movs from public.movimiento_stock where referencia_id = v_venta),
    'el cobro repetido volvió a mover stock');
  perform pg_temp.comprobar(
    (select estado = 'cobrada' and cobrada_en = v_antes from public.venta where id = v_venta),
    'el cobro repetido cambió la venta');

  -- 3. Otro puesto que cobra la misma venta no puede sumarle sus pagos:
  --    la base lo rechaza y queda a la vista.
  begin
    insert into public.venta_pago (venta_id, medio_pago_id, importe)
    select venta_id, medio_pago_id, importe from public.venta_pago where venta_id = v_venta;
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  perform pg_temp.comprobar(v_error like '%no admite cambios%', 'entró un segundo pago en una venta cobrada');

  -- 4. Dos juegos de pagos cargados antes de cobrar: no cierra.
  v_venta := pg_temp.venta('PRUEBA-REPETIDO-2', v_mostrador, v_vendedor);
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  select venta_id, medio_pago_id, importe from public.venta_pago where venta_id = v_venta;
  begin
    perform public.cobrar_venta(v_venta, null, v_vendedor);
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  perform pg_temp.comprobar(v_error like '%Los pagos suman%', 'un cobro doble pasó sin aviso');

  -- 5. Una venta anulada tampoco se cobra, aunque los pagos sumen.
  v_venta := pg_temp.venta('PRUEBA-REPETIDO-3', v_mostrador, v_vendedor);
  update public.venta set estado = 'anulada' where id = v_venta;
  begin
    perform public.cobrar_venta(v_venta, null, v_vendedor);
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  perform pg_temp.comprobar(v_error like '%no se puede cobrar%', 'se cobró una venta anulada');

  -- 6. Cobrada con percepción: los pagos son el total más lo percibido,
  --    y el reenvío también se da por recibido. Un Responsable Inscripto
  --    de prueba y $1.210.000 al 21% pasan el mínimo de percepción.
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento)
  values ('PRUEBA REPETIDO RI', 1, 80, '30999999987') returning id into v_cliente;
  insert into public.venta (codigo, cliente_id, estado, documentacion)
  values ('PRUEBA-REPETIDO-4', v_cliente, 'en_caja', 'fiscal') returning id into v_venta;
  insert into public.venta_linea (venta_id, codigo_producto, descripcion, cantidad,
    precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva)
  values (v_venta, 'PRUEBA', 'Prueba percepción', 1, 1210000, 1210000, 1210000, 5, 'gravado');
  v_percepcion := public.percepcion_de_venta(v_venta);
  perform pg_temp.comprobar(v_percepcion > 0, 'la venta de prueba no lleva percepción');
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (v_venta, (select id from public.medio_pago where tipo = 'efectivo' and eliminado_en is null limit 1),
          1210000 + v_percepcion);
  perform public.cobrar_venta(v_venta, null, v_vendedor);
  perform pg_temp.comprobar(public.cobrar_venta(v_venta, null, v_vendedor) = v_venta,
    'el cobro repetido con percepción no se dio por recibido');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
