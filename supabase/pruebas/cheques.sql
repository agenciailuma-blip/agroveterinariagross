-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LOS CHEQUES, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; todo lo demás corre como un
-- Administrador de verdad, con las políticas de la base, y al final como
-- alguien sin permisos para ver que lo frenan.
--
-- Lo que se cuida: que cada cheque entre una sola vez a la cartera y por
-- su camino (la caja, la cobranza), que salga entero y una sola vez (el
-- depósito, el endoso), que el rechazo le devuelva la deuda a quien
-- corresponde, que anular un pago deshaga lo que hizo con los cheques, y
-- que el calendario muestre cada cosa una vez y en su fecha.
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

create function pg_temp.venta(p_codigo text, p_cliente uuid, p_precio numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.venta (codigo, cliente_id, estado, documentacion)
  values (p_codigo, p_cliente, 'en_caja', 'fiscal') returning id into v;
  insert into public.venta_linea (venta_id, codigo_producto, descripcion, cantidad,
    precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva)
  values (v, 'PRUEBA', 'Prueba cheques', 1, p_precio, p_precio, p_precio, 5, 'gravado');
  return v;
end $$;

create function pg_temp.pagar_con_cheque(p_venta uuid, p_importe numeric, p_datos jsonb)
returns void language sql as $$
  insert into public.venta_pago (venta_id, medio_pago_id, importe, datos_cheque)
  values (p_venta, (select id from public.medio_pago where tipo = 'cheque' and eliminado_en is null limit 1),
          p_importe, p_datos)
$$;

create function pg_temp.cheque(p_banco text, p_numero text)
returns public.cheque language sql as $$
  select * from public.cheque where banco = p_banco and numero = p_numero order by creado_en desc limit 1
$$;

create function pg_temp.saldo_cliente(p uuid) returns numeric language sql as $$
  select coalesce(sum(importe), 0) from public.movimiento_cuenta_corriente where cliente_id = p
$$;

create function pg_temp.saldo_proveedor(p uuid) returns numeric language sql as $$
  select saldo from public.vista_saldo_proveedor where proveedor_id = p
$$;

do $$
declare
  v_admin   uuid;
  v_cc      uuid;   -- cliente con cuenta corriente
  v_cf      uuid;   -- cliente sin cuenta corriente
  v_prov    uuid;
  v_caja    uuid;
  v_medio   uuid;
  v1        uuid;
  v2        uuid;
  v_fac     uuid;
  v_pago    uuid;
  v_pago2   uuid;
  v_ids     uuid[];
  v_ch      public.cheque;
  v_a       public.cheque;   -- de la caja, al día
  v_b       public.cheque;   -- de la caja, diferido
  v_c       public.cheque;   -- de la cobranza
  v_p       public.cheque;   -- propio
  v_hoy     date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  -- ─── 0. Los permisos y el medio de pago ───
  perform pg_temp.comprobar(
    (select count(*) = 4 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
      where rp.permiso_clave in ('cheques.ver', 'cheques.gestionar') and r.nombre in ('Administrador', 'Encargado'))
    and not exists (select 1 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
                     where rp.permiso_clave like 'cheques.%' and r.nombre in ('Cajero', 'Vendedor')),
    'los permisos de cheques no quedaron en Administrador y Encargado, y sólo ahí');

  select id into v_medio from public.medio_pago where tipo = 'cheque' and eliminado_en is null;
  perform pg_temp.comprobar(v_medio is not null
    and (select not afecta_caja and activo and lista_precio_id is not null from public.medio_pago where id = v_medio),
    'no quedó un medio «Cheque» activo, con lista y fuera del arqueo');

  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, cuenta_corriente, dias_vencimiento)
    values ('PRUEBA CHEQUES CUENTA', 1, 80, '30712345671', true, 30) returning id into v_cc;
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento)
    values ('PRUEBA CHEQUES MOSTRADOR', 5, 96, '99999998') returning id into v_cf;
  insert into public.proveedor (nombre) values ('PRUEBA CHEQUES PROVEEDOR') returning id into v_prov;
  insert into public.caja (terminal_id, estado, monto_inicial, cerrada_en)
    values ((select id from public.terminal limit 1), 'cerrada', 0, now()) returning id into v_caja;

  -- Lo que el cliente ya debía: una venta de $50.000 que vence en 10 días.
  insert into public.movimiento_cuenta_corriente (cliente_id, tipo, importe, concepto, vencimiento, referencia_tipo)
    values (v_cc, 'venta', 50000, 'Venta de prueba', v_hoy + 10, 'manual');

  v1 := pg_temp.venta('PRUEBA-CHQ-1', v_cf, 80000);
  v2 := pg_temp.venta('PRUEBA-CHQ-2', v_cc, 5000);

  perform set_config('role', 'authenticated', true);

  -- La base no deja que el cheque cuente en el arqueo.
  begin
    perform public.guardar_medio_pago(v_medio, 'Cheque', 'cheque',
      (select lista_precio_id from public.medio_pago where id = v_medio), false, 1, true, 50);
    perform pg_temp.comprobar(false, 'se pudo configurar el cheque para que sume al arqueo');
  exception when check_violation then
    perform pg_temp.comprobar(sqlerrm like '%medio_pago_cheque_no_va_al_cajon%', sqlerrm);
  end;

  -- ─── 1. Dos cheques en la caja: entran a la cartera al cobrar, no antes ───
  perform pg_temp.pagar_con_cheque(v1, 30000, jsonb_build_object(
    'banco', 'Nación', 'numero', '00012345', 'fecha_pago', v_hoy, 'librador', 'Juan Pérez',
    'librador_cuit', '20-12345678-6', 'electronico', false));
  perform pg_temp.pagar_con_cheque(v1, 50000, jsonb_build_object(
    'banco', 'Macro', 'numero', '777', 'fecha_pago', v_hoy + 45, 'electronico', true));

  perform pg_temp.comprobar(not exists (select 1 from public.cheque where venta_pago_id in
    (select id from public.venta_pago where venta_id = v1)), 'el cheque entró a la cartera antes de cobrar');

  perform public.cobrar_venta(v1, v_caja);

  v_a := pg_temp.cheque('Nación', '00012345');
  v_b := pg_temp.cheque('Macro', '777');
  perform pg_temp.comprobar(v_a.estado = 'en_cartera' and v_a.importe = 30000 and v_a.cliente_id = v_cf
    and v_a.caja_id = v_caja and v_a.librador = 'Juan Pérez' and v_a.librador_cuit = '20123456786',
    'el cheque al día de la caja no entró con sus datos');
  perform pg_temp.comprobar(v_b.electronico and v_b.fecha_pago = v_hoy + 45
    and v_b.librador = 'PRUEBA CHEQUES MOSTRADOR',
    'el e-cheq diferido no entró con su fecha, o sin librador no tomó el nombre del cliente');
  perform pg_temp.comprobar(
    (select diferido from public.vista_cheque where id = v_b.id)
    and not (select diferido from public.vista_cheque where id = v_a.id),
    'la cartera no distingue el cheque al día del diferido');
  perform pg_temp.comprobar(
    (select presentar_hasta = v_hoy + 30 from public.vista_cheque where id = v_a.id),
    'el plazo para depositarlo no son 30 días desde la fecha de pago');
  perform pg_temp.comprobar(
    (select count(*) = 2 from public.cheque_movimiento where cheque_id in (v_a.id, v_b.id)
      and detalle = 'Recibido en la caja, venta PRUEBA-CHQ-1'),
    'la historia no dice que entraron por la caja');
  perform pg_temp.comprobar(
    (select count(*) = 2 from public.cheques_de_la_caja(v_caja)),
    'el cierre de la caja no ve los cheques del turno');

  -- ─── 2. Una caja con la versión anterior: el cheque entra igual, para completar ───
  perform pg_temp.pagar_con_cheque(v2, 5000, null);
  perform public.cobrar_venta(v2);
  select * into v_ch from public.cheque
   where venta_pago_id = (select id from public.venta_pago where venta_id = v2);
  perform pg_temp.comprobar(v_ch.id is not null and v_ch.fecha_pago = v_hoy
    and (select faltan_datos from public.vista_cheque where id = v_ch.id),
    'un cheque sin datos no entró a la cartera, o no figura para completar');

  begin
    perform public.depositar_cheques(array[v_ch.id], v_hoy);
    perform pg_temp.comprobar(false, 'se depositó un cheque sin número');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Al cheque sin número le faltan datos%', sqlerrm);
  end;

  perform public.corregir_cheque(v_ch.id, jsonb_build_object('banco', 'Galicia', 'numero', '4321'));
  perform pg_temp.comprobar(
    not (select faltan_datos from public.vista_cheque where id = v_ch.id)
    and exists (select 1 from public.cheque_movimiento where cheque_id = v_ch.id
                 and detalle = 'Datos corregidos: banco — → Galicia, número — → 4321'),
    'corregir los datos no completó el cheque o no quedó en la historia');

  begin
    perform public.corregir_cheque(v_ch.id, jsonb_build_object('librador_cuit', '20-12345678-0'));
    perform pg_temp.comprobar(false, 'entró un CUIT de librador que no es válido');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El CUIT del librador no es válido.', sqlerrm);
  end;

  -- ─── 3. Se anula la venta: el cheque que está en la cartera vuelve al cliente ───
  perform public.anular_venta(v2, 'Prueba de cheques');
  perform pg_temp.comprobar((select estado = 'devuelto' from public.cheque where id = v_ch.id),
    'anular la venta no devolvió el cheque');

  -- ─── 4. La cobranza con cheque baja la deuda y el cheque queda en la cartera ───
  v_ids := public.registrar_cobranza_con_cheques(v_cc, jsonb_build_array(jsonb_build_object(
    'banco', 'Credicoop', 'numero', '555001', 'importe', 30000, 'fecha_pago', v_hoy + 20,
    'librador', 'Agro SRL', 'librador_cuit', '30999999995')));
  select * into v_c from public.cheque where id = v_ids[1];
  perform pg_temp.comprobar(pg_temp.saldo_cliente(v_cc) = 20000,
    'la cobranza con cheque no bajó la deuda por su importe: da ' || pg_temp.saldo_cliente(v_cc));
  perform pg_temp.comprobar(v_c.estado = 'en_cartera' and v_c.cobranza_id is not null,
    'el cheque de la cobranza no quedó en la cartera atado a su renglón');
  perform pg_temp.comprobar(
    (select concepto = 'Cobranza con cheque Credicoop N° 555001 al ' || to_char(v_hoy + 20, 'DD/MM/YYYY')
       from public.movimiento_cuenta_corriente where id = v_c.cobranza_id),
    'el renglón de la cuenta no dice qué cheque trajo');

  begin
    perform public.registrar_cobranza_con_cheques(v_cc, jsonb_build_array(jsonb_build_object(
      'banco', 'CREDICOOP', 'numero', '0555001', 'importe', 30000, 'fecha_pago', v_hoy + 20)));
    perform pg_temp.comprobar(false, 'el mismo cheque entró dos veces a la cartera');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El cheque Credicoop N° 555001 de $ 30.000,00 ya está cargado: figura en cartera.', sqlerrm);
  end;

  begin
    perform public.registrar_cobranza_con_cheques(v_cc, jsonb_build_array(jsonb_build_object(
      'banco', 'Nación', 'numero', '1', 'importe', 100, 'fecha_pago', v_hoy - 31)));
    perform pg_temp.comprobar(false, 'entró un cheque que el banco ya no paga');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'El cheque N° 1 es del %: pasaron más de 30 días%', sqlerrm);
  end;

  begin
    perform public.registrar_cobranza(v_cc, 1000, v_medio);
    perform pg_temp.comprobar(false, 'la cobranza de siempre aceptó un cheque sin sus datos');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Para cobrar con cheque hacen falta los datos%', sqlerrm);
  end;
  perform pg_temp.comprobar(pg_temp.saldo_cliente(v_cc) = 20000, 'una cobranza rechazada dejó algo en la cuenta');

  -- ─── 5. Pagarle al proveedor: un cheque de la cartera y un e-cheq propio ───
  v_fac := public.registrar_compra(v_prov, 1::smallint, 9, 1, v_hoy - 5, 0, 0, null,
    jsonb_build_array(jsonb_build_object('alicuota_iva_id', 5, 'base_imponible', 100000, 'importe', 21000)),
    '[]'::jsonb, v_hoy + 10);   -- $121.000

  begin
    perform public.registrar_pago_proveedor(v_prov, v_hoy,
      jsonb_build_array(jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', v_c.id, 'importe', 20000)));
    perform pg_temp.comprobar(false, 'se endosó una parte de un cheque');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El cheque Credicoop N° 555001 es de $ 30.000,00: se endosa entero.', sqlerrm);
  end;

  begin
    perform public.registrar_pago_proveedor(v_prov, v_hoy,
      jsonb_build_array(jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', v_c.id, 'importe', 30000),
                        jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', v_c.id, 'importe', 30000)));
    perform pg_temp.comprobar(false, 'el mismo cheque entró dos veces en un pago');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El mismo cheque está dos veces en el pago.', sqlerrm);
  end;

  v_pago := public.registrar_pago_proveedor(v_prov, v_hoy,
    jsonb_build_array(
      jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', v_c.id, 'importe', 30000),
      jsonb_build_object('medio', 'cheque_propio', 'importe', 91000, 'banco', 'Galicia',
                         'numero', '90001', 'fecha_cobro', v_hoy + 15, 'electronico', true)),
    jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_fac, 'importe', 121000)));

  v_c := pg_temp.cheque('Credicoop', '555001');
  v_p := pg_temp.cheque('Galicia', '90001');
  perform pg_temp.comprobar(v_c.estado = 'endosado' and v_c.proveedor_id = v_prov,
    'el cheque de tercero no quedó endosado al proveedor');
  perform pg_temp.comprobar(v_p.origen = 'propio' and v_p.estado = 'emitido' and v_p.electronico
    and v_p.fecha_pago = v_hoy + 15 and v_p.proveedor_id = v_prov,
    'el e-cheq propio no quedó entregado al proveedor con su fecha');
  perform pg_temp.comprobar(pg_temp.saldo_proveedor(v_prov) = 0, 'el pago con cheques no canceló la factura');
  perform pg_temp.comprobar(
    (select detalle like '%E-cheq propio Galicia N° 90001 al ' || to_char(v_hoy + 15, 'DD/MM/YYYY') || ' $ 91.000,00%'
        and detalle like '%Cheque de tercero Credicoop N° 555001 al %'
       from public.vista_movimiento_proveedor where id = v_pago),
    'el resumen del proveedor no dice con qué cheques se pagó: '
      || (select detalle from public.vista_movimiento_proveedor where id = v_pago));

  begin
    perform public.registrar_pago_proveedor(v_prov, v_hoy,
      jsonb_build_array(jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', v_c.id, 'importe', 30000)));
    perform pg_temp.comprobar(false, 'se endosó dos veces el mismo cheque');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El cheque Credicoop N° 555001 ya no está en la cartera: figura endosado.', sqlerrm);
  end;

  begin
    perform public.registrar_pago_proveedor(v_prov, v_hoy,
      jsonb_build_array(jsonb_build_object('medio', 'cheque_propio', 'importe', 10, 'banco', 'GALICIA',
                                           'numero', '090001', 'fecha_cobro', v_hoy)));
    perform pg_temp.comprobar(false, 'el mismo cheque propio se cargó dos veces');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El e-cheq Galicia N° 90001 propio ya está cargado: figura entregado.', sqlerrm);
  end;

  -- ─── 6. Anular el pago deshace lo de los cheques ───
  perform public.anular_pago_proveedor(v_pago, 'Prueba');
  v_c := pg_temp.cheque('Credicoop', '555001');
  v_p := pg_temp.cheque('Galicia', '90001');
  perform pg_temp.comprobar(v_c.estado = 'en_cartera' and v_c.proveedor_id is null,
    'anular el pago no devolvió el cheque de tercero a la cartera');
  perform pg_temp.comprobar(v_p.estado = 'anulado', 'anular el pago no anuló el cheque propio');
  perform pg_temp.comprobar(pg_temp.saldo_proveedor(v_prov) = 121000, 'anular el pago no devolvió la deuda');

  -- Y el mismo cheque se puede volver a endosar.
  v_pago := public.registrar_pago_proveedor(v_prov, v_hoy,
    jsonb_build_array(jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', v_c.id, 'importe', 30000)),
    jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_fac, 'importe', 30000)));
  perform pg_temp.comprobar(pg_temp.saldo_proveedor(v_prov) = 91000, 'el cheque devuelto a la cartera no se pudo endosar de nuevo');

  -- ─── 7. Depositar, y deshacer un depósito equivocado ───
  perform public.depositar_cheques(array[v_a.id, v_b.id], v_hoy, 'Macro cta. cte.');
  perform pg_temp.comprobar(
    (select bool_and(estado = 'depositado' and deposito = 'Macro cta. cte.') from public.cheque where id in (v_a.id, v_b.id)),
    'los cheques no quedaron depositados');

  begin
    perform public.depositar_cheques(array[v_a.id], v_hoy);
    perform pg_temp.comprobar(false, 'se depositó dos veces el mismo cheque');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El cheque Nación N° 00012345 no está en la cartera: figura depositado.', sqlerrm);
  end;

  perform public.deshacer_cheque(v_b.id, 'Era otro cheque');
  perform pg_temp.comprobar((select estado = 'en_cartera' and deposito is null from public.cheque where id = v_b.id),
    'deshacer el depósito no devolvió el cheque a la cartera');

  -- ─── 8. El rechazo de un cheque endosado: se le vuelve a deber al proveedor y se le carga al cliente ───
  perform public.rechazar_cheque(v_c.id, v_hoy, 'Sin fondos', 500, true);
  perform pg_temp.comprobar((select estado = 'rechazado' and gastos = 500 from public.cheque where id = v_c.id),
    'el cheque no quedó rechazado con sus gastos');
  perform pg_temp.comprobar(pg_temp.saldo_proveedor(v_prov) = 121000,
    'el cheque rechazado no volvió a la cuenta del proveedor: da ' || pg_temp.saldo_proveedor(v_prov));
  perform pg_temp.comprobar(
    (select pendiente = 30000 and vencida and descripcion = 'Cheque Credicoop N° 555001 rechazado'
       from public.vista_pendiente_proveedor where origen = 'cheque_rechazado' and id = v_c.id),
    'el cheque rechazado no figura como pendiente vencido del proveedor');
  perform pg_temp.comprobar(pg_temp.saldo_cliente(v_cc) = 50500,
    'al cliente no se le cargó el cheque con los gastos: da ' || pg_temp.saldo_cliente(v_cc));
  perform pg_temp.comprobar(
    (select concepto = 'Cheque Credicoop N° 555001 rechazado — Sin fondos (con $ 500,00 de gastos)'
        and vencimiento = v_hoy
       from public.movimiento_cuenta_corriente
      where id = (select cargo_id from public.cheque where id = v_c.id)),
    'el cargo al cliente no dice qué cheque ni vence en el día');

  -- Se le paga al proveedor lo que se le volvió a deber, como a una factura.
  perform public.registrar_pago_proveedor(v_prov, v_hoy,
    jsonb_build_array(jsonb_build_object('medio', 'transferencia', 'importe', 30000)),
    jsonb_build_array(jsonb_build_object('origen', 'cheque_rechazado', 'id', v_c.id, 'importe', 30000)));
  perform pg_temp.comprobar(
    (select pendiente = 0 from public.vista_pendiente_proveedor where origen = 'cheque_rechazado' and id = v_c.id),
    'no se pudo pagar el cheque rechazado como una factura');

  -- Un pago con un cheque que ya rebotó no se anula: pasó de verdad.
  begin
    perform public.anular_pago_proveedor(v_pago, 'Prueba');
    perform pg_temp.comprobar(false, 'se anuló un pago cuyo cheque ya había sido rechazado');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El cheque Credicoop N° 555001 ya figura rechazado: el pago no se puede anular.', sqlerrm);
  end;

  -- ─── 9. El rechazo de uno depositado, de un cliente sin cuenta corriente ───
  begin
    perform public.rechazar_cheque(v_a.id, v_hoy, 'Sin fondos', 0, true);
    perform pg_temp.comprobar(false, 'se le cargó un cheque a un cliente sin cuenta corriente');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'PRUEBA CHEQUES MOSTRADOR no tiene cuenta corriente%', sqlerrm);
  end;
  perform public.rechazar_cheque(v_a.id, v_hoy, 'Sin fondos', 0, false);
  perform pg_temp.comprobar((select estado = 'rechazado' and cargo_id is null from public.cheque where id = v_a.id),
    'el rechazo sin cargo no quedó registrado');

  begin
    perform public.rechazar_cheque(v_b.id, v_hoy, 'Sin fondos');
    perform pg_temp.comprobar(false, 'se rechazó un cheque que todavía estaba en la cartera');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'Un cheque en cartera no se puede marcar como rechazado.', sqlerrm);
  end;

  -- ─── 10. El cheque propio: se debita, y entonces el pago ya no se anula ───
  v_pago2 := public.registrar_pago_proveedor(v_prov, v_hoy,
    jsonb_build_array(jsonb_build_object('medio', 'cheque_propio', 'importe', 91000, 'banco', 'Galicia',
                                         'numero', '90002', 'fecha_cobro', v_hoy + 30)),
    jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_fac, 'importe', 91000)));
  v_p := pg_temp.cheque('Galicia', '90002');

  -- ─── 11. El calendario: cada cosa una vez y en su fecha ───
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.vista_calendario where referencia = v_b.id and fecha = v_hoy + 45
        and sentido = 'entra' and importe = 50000),
    'el cheque en cartera no está en el calendario en su fecha de pago');
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.vista_calendario where referencia = v_p.id and fecha = v_hoy + 30
        and sentido = 'sale' and importe = 91000),
    'el cheque propio no está en el calendario el día que se debita');
  perform pg_temp.comprobar(
    not exists (select 1 from public.vista_calendario where tipo = 'proveedor' and quien = 'PRUEBA CHEQUES PROVEEDOR'),
    'la factura pagada con un cheque diferido sigue figurando como a pagar: contaría dos veces');
  perform pg_temp.comprobar(
    (select sum(importe) = 50500 from public.vista_calendario where tipo = 'cuenta_cliente' and referencia = v_cc),
    'lo que debe el cliente en el calendario no es su saldo: da '
      || (select sum(importe) from public.vista_calendario where tipo = 'cuenta_cliente' and referencia = v_cc));
  perform pg_temp.comprobar(
    not exists (select 1 from public.vista_calendario where referencia in (v_a.id, v_c.id)),
    'un cheque rechazado sigue en el calendario como plata que entra');

  perform public.marcar_cheques_debitados(array[v_p.id], v_hoy);
  perform pg_temp.comprobar(
    not exists (select 1 from public.vista_calendario where referencia = v_p.id),
    'el cheque debitado sigue en el calendario');
  begin
    perform public.anular_pago_proveedor(v_pago2, 'Prueba');
    perform pg_temp.comprobar(false, 'se anuló un pago con un cheque ya debitado');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'El cheque Galicia N° 90002 ya figura debitado: el pago no se puede anular.', sqlerrm);
  end;

  -- ─── 12. Devolverle el cheque al cliente, cargándoselo ───
  perform public.devolver_cheque(v_b.id, v_hoy, 'Lo cambió por efectivo', false);
  perform pg_temp.comprobar((select estado = 'devuelto' and motivo = 'Lo cambió por efectivo' from public.cheque where id = v_b.id),
    'el cheque no quedó devuelto con su motivo');
  begin
    perform public.devolver_cheque(v_b.id, v_hoy, 'Otra vez');
    perform pg_temp.comprobar(false, 'se devolvió dos veces el mismo cheque');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'Sólo se devuelve un cheque que está en la cartera.', sqlerrm);
  end;

  -- ─── 13. La historia cuenta todo, en orden ───
  perform pg_temp.comprobar(
    (select array_agg(estado order by creado_en, id) from public.cheque_movimiento where cheque_id = v_c.id)
      = array['en_cartera', 'endosado', 'en_cartera', 'endosado', 'rechazado'],
    'la historia del cheque endosado, devuelto a la cartera y rechazado no está completa');

  -- ─── 14. Sin permiso no se ve ni se mueve nada ───
  perform pg_temp.como(gen_random_uuid());
  perform pg_temp.comprobar(not exists (select 1 from public.cheque), 'alguien sin permiso ve la cartera');
  perform pg_temp.comprobar(not exists (select 1 from public.vista_calendario), 'alguien sin permiso ve el calendario');
  begin
    perform public.depositar_cheques(array[v_b.id], v_hoy);
    perform pg_temp.comprobar(false, 'alguien sin permiso depositó un cheque');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para mover la cartera de cheques.', sqlerrm);
  end;
  begin
    perform public.registrar_cobranza_con_cheques(v_cc, jsonb_build_array(jsonb_build_object(
      'banco', 'Nación', 'numero', '9', 'importe', 100, 'fecha_pago', v_hoy)));
    perform pg_temp.comprobar(false, 'alguien sin permiso registró una cobranza con cheque');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para registrar cobranzas.', sqlerrm);
  end;

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
