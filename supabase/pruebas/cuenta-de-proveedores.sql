-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA CUENTA CORRIENTE DE PROVEEDORES, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad, con las políticas de la base, y
-- como alguien sin cuenta para ver que lo frenan.
--
-- Lo que se cuida es que el saldo diga lo que se debe: que un pago baje
-- el saldo una sola vez, que a una factura no se le impute más de lo que
-- le falta, que la nota de crédito descuente, y que anular un pago
-- devuelva la deuda sin tocar nada más.
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

create function pg_temp.saldo(p uuid) returns numeric language sql as $$
  select saldo from public.vista_saldo_proveedor where proveedor_id = p
$$;

create function pg_temp.pendiente(p_id uuid) returns numeric language sql as $$
  select pendiente from public.vista_pendiente_proveedor where id = p_id
$$;

-- Una factura con un solo renglón al 21%: neto n, total n × 1,21.
create function pg_temp.factura(p_prov uuid, p_tipo smallint, p_numero bigint, p_neto numeric, p_vence date)
returns uuid language sql as $$
  select public.registrar_compra(p_prov, p_tipo, 5, p_numero, current_date - 20, 0, 0, null,
    jsonb_build_array(jsonb_build_object('alicuota_iva_id', 5, 'base_imponible', p_neto, 'importe', p_neto * 0.21)),
    '[]'::jsonb, p_vence)
$$;

do $$
declare
  v_admin uuid;
  v_prov  uuid;
  v_otro  uuid;
  v_si    uuid;
  v_f1    uuid;
  v_f2    uuid;
  v_nc    uuid;
  v_p1    uuid;
  v_p2    uuid;
  v_p3    uuid;
  v_s     public.vista_saldo_proveedor;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  perform pg_temp.comprobar(
    (select count(*) = 2 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
     where rp.permiso_clave = 'proveedores.pagar' and r.nombre in ('Administrador', 'Encargado'))
    and not exists (select 1 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
                    where rp.permiso_clave = 'proveedores.pagar' and r.nombre in ('Cajero', 'Vendedor')),
    'el permiso de pagar no quedó en Administrador y Encargado, y sólo ahí');

  insert into public.proveedor (nombre) values ('PRUEBA CUENTA') returning id into v_prov;
  insert into public.proveedor (nombre) values ('PRUEBA OTRO')   returning id into v_otro;

  -- Como usuario de verdad, no como dueño de la base.
  perform set_config('role', 'authenticated', true);

  -- ─── 1. El saldo se arma con el inicial, las facturas y la nota de crédito ───
  perform public.definir_saldo_inicial_proveedor(v_prov, current_date - 30, 5000, 'Según OBTech');
  select id into v_si from public.proveedor_saldo_inicial where proveedor_id = v_prov and anulado_en is null;

  v_f1 := pg_temp.factura(v_prov, 1::smallint, 1, 1000, current_date - 5);   -- 1210, vencida
  v_f2 := pg_temp.factura(v_prov, 1::smallint, 2, 2000, current_date + 10);  -- 2420
  v_nc := pg_temp.factura(v_prov, 3::smallint, 3, 100,  null);               -- −121

  select * into v_s from public.vista_saldo_proveedor where proveedor_id = v_prov;
  perform pg_temp.comprobar(v_s.saldo = 8509, 'el saldo no es 5000 + 1210 + 2420 − 121: da ' || v_s.saldo);
  perform pg_temp.comprobar(v_s.vencido = 1210, 'lo vencido no es sólo la factura vencida: da ' || v_s.vencido);
  perform pg_temp.comprobar(pg_temp.pendiente(v_nc) = -121, 'la nota de crédito no figura como pendiente negativo');

  -- ─── 2. Un pago al saldo inicial ───
  v_p1 := public.registrar_pago_proveedor(v_prov, current_date,
    jsonb_build_array(jsonb_build_object('medio', 'transferencia', 'importe', 1000, 'referencia', 'Op 123')),
    jsonb_build_array(jsonb_build_object('origen', 'saldo_inicial', 'id', v_si, 'importe', 1000)));
  perform pg_temp.comprobar(pg_temp.saldo(v_prov) = 7509, 'el pago no bajó el saldo una sola vez');
  perform pg_temp.comprobar(pg_temp.pendiente(v_si) = 4000, 'al saldo inicial no le quedan 4000');

  -- ─── 3. Un cheque que paga una factura descontando la nota de crédito ───
  v_p2 := public.registrar_pago_proveedor(v_prov, current_date,
    jsonb_build_array(jsonb_build_object('medio', 'cheque_propio', 'importe', 1089,
                                         'banco', 'Nación', 'numero', '0001234', 'fecha_cobro', current_date + 30)),
    jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_f1, 'importe', 1210),
                      jsonb_build_object('origen', 'compra', 'id', v_nc, 'importe', -121)));
  perform pg_temp.comprobar(pg_temp.pendiente(v_f1) = 0 and pg_temp.pendiente(v_nc) = 0,
    'la factura o la nota de crédito no quedaron canceladas');
  perform pg_temp.comprobar(pg_temp.saldo(v_prov) = 6420, 'el saldo después del cheque no es 6420');
  perform pg_temp.comprobar((select vencido from public.vista_saldo_proveedor where proveedor_id = v_prov) = 0,
    'una factura pagada sigue figurando vencida');

  -- Los importes, como se escriben acá. Salía «1,089.00» el 28/09: el
  -- servidor formatea en inglés si nadie le dice otra cosa.
  perform pg_temp.comprobar(
    (select detalle = 'Cheque propio Nación N° 0001234 al ' || to_char(current_date + 30, 'DD/MM/YYYY') || ' $ 1.089,00'
       from public.vista_movimiento_proveedor where id = v_p2),
    'el detalle del cheque no se escribe como en Argentina: '
      || (select detalle from public.vista_movimiento_proveedor where id = v_p2));

  -- ─── 4. Lo que no se puede ───
  begin
    perform public.registrar_pago_proveedor(v_prov, current_date,
      jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', 3000)),
      jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_f2, 'importe', 3000)));
    perform pg_temp.comprobar(false, 'se imputó a una factura más de lo que le faltaba');
  exception when raise_exception then
    perform pg_temp.comprobar(
      sqlerrm = 'A Factura A 0005-00000002 le quedan $ 2.420,00 por pagar, y se le quieren imputar $ 3.000,00.', sqlerrm);
  end;

  begin
    perform public.registrar_pago_proveedor(v_prov, current_date,
      jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', 100)),
      jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_f2, 'importe', 500)));
    perform pg_temp.comprobar(false, 'se imputó más plata de la que salió');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Se está imputando%', sqlerrm);
  end;

  -- Desde el 30/09 el cheque de tercero se elige de la cartera: no se
  -- tipea. El detalle está en cheques.sql.
  begin
    perform public.registrar_pago_proveedor(v_prov, current_date,
      jsonb_build_array(jsonb_build_object('medio', 'cheque_tercero', 'importe', 100)));
    perform pg_temp.comprobar(false, 'entró un cheque de tercero que no salió de la cartera');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'El cheque de tercero se elige de la cartera%', sqlerrm);
  end;

  begin
    perform public.registrar_pago_proveedor(v_otro, current_date,
      jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', 100)),
      jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_f2, 'importe', 100)));
    perform pg_temp.comprobar(false, 'se imputó el pago de un proveedor a la factura de otro');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Uno de los comprobantes no es de este proveedor%', sqlerrm);
  end;

  begin
    perform public.registrar_pago_proveedor(v_prov, current_date + 1,
      jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', 100)));
    perform pg_temp.comprobar(false, 'entró un pago con fecha de mañana');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'La fecha del pago%', sqlerrm);
  end;
  perform pg_temp.comprobar(pg_temp.saldo(v_prov) = 6420, 'un pago rechazado dejó algo en el saldo');

  -- ─── 5. Un pago a cuenta baja el saldo sin cancelar nada ───
  v_p3 := public.registrar_pago_proveedor(v_prov, current_date,
    jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', 500)));
  select * into v_s from public.vista_saldo_proveedor where proveedor_id = v_prov;
  perform pg_temp.comprobar(v_s.saldo = 5920 and v_s.a_cuenta = 500,
    'el pago a cuenta no bajó el saldo o no figura a cuenta');
  perform pg_temp.comprobar(pg_temp.pendiente(v_f2) = 2420, 'el pago a cuenta canceló una factura');

  -- ─── 6. Una factura con pagos no se da de baja ───
  begin
    perform public.anular_compra(v_f1, 'Prueba');
    perform pg_temp.comprobar(false, 'se dio de baja una factura con pagos imputados');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Esa factura tiene pagos imputados%', sqlerrm);
  end;

  -- ─── 7. Anular el cheque devuelve la deuda, y sólo eso ───
  perform public.anular_pago_proveedor(v_p2, 'El cheque volvió rechazado');
  perform pg_temp.comprobar(pg_temp.pendiente(v_f1) = 1210 and pg_temp.pendiente(v_nc) = -121,
    'anular el pago no devolvió lo pendiente de la factura y la nota');
  perform pg_temp.comprobar(pg_temp.saldo(v_prov) = 7009, 'anular el pago no devolvió el saldo');
  perform pg_temp.comprobar(
    (select motivo_anulacion = 'El cheque volvió rechazado' and anulado_por is not null
       from public.pago_proveedor where id = v_p2),
    'la anulación no dejó el motivo y quién');

  -- ─── 8. La nota de crédito se descuenta sin que salga plata ───
  perform public.registrar_pago_proveedor(v_prov, current_date, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('origen', 'compra', 'id', v_f2, 'importe', 121),
                      jsonb_build_object('origen', 'compra', 'id', v_nc, 'importe', -121)));
  perform pg_temp.comprobar(pg_temp.pendiente(v_f2) = 2299 and pg_temp.pendiente(v_nc) = 0,
    'descontar la nota de crédito no achicó la factura');
  perform pg_temp.comprobar(pg_temp.saldo(v_prov) = 7009, 'descontar una nota cambió el saldo');

  -- ─── 9. El saldo inicial no se cambia si ya tiene pagos ───
  begin
    perform public.definir_saldo_inicial_proveedor(v_prov, current_date - 30, 6000);
    perform pg_temp.comprobar(false, 'se cambió un saldo inicial que ya tenía pagos');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Ese saldo ya tiene pagos imputados%', sqlerrm);
  end;
  perform public.anular_pago_proveedor(v_p1, 'Prueba');
  perform public.definir_saldo_inicial_proveedor(v_prov, current_date - 30, 6000);
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.proveedor_saldo_inicial where proveedor_id = v_prov and anulado_en is null),
    'quedaron dos saldos iniciales vigentes');
  perform pg_temp.comprobar(pg_temp.saldo(v_prov) = 9009, 'el saldo con el inicial corregido no es 9009');

  -- ─── 10. El resumen tiene todo, con debe y haber ───
  perform pg_temp.comprobar(
    (select sum(debe) - sum(haber) from public.vista_movimiento_proveedor where proveedor_id = v_prov) = 9009,
    'el resumen de cuenta no suma lo mismo que el saldo');

  -- ─── 11. Sin permiso no se paga ───
  perform pg_temp.como(gen_random_uuid());
  begin
    perform public.registrar_pago_proveedor(v_prov, current_date,
      jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', 1)));
    perform pg_temp.comprobar(false, 'alguien sin permiso registró un pago');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'No tenés permiso para registrar pagos a proveedores.', sqlerrm);
  end;
  perform pg_temp.comprobar(not exists (select 1 from public.vista_saldo_proveedor where proveedor_id = v_prov),
    'alguien sin permiso ve el saldo de un proveedor');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
