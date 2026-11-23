-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LAS NOTAS A MANO Y DEL RECIBO LIBRE, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Va con 20261123120000_notas_a_mano_y_recibo_libre.sql. No pide CAE:
-- las notas quedan pendientes y se deshacen al final.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_admin_auth uuid;
  v_terminal   uuid;
  v_cliente    uuid;
  v_factura    public.comprobante;
  v_caja       uuid;
  v_efectivo   uuid;
  v_transf     uuid;
  v_saldo      numeric;
  v_esperado   numeric;
  v_nc         uuid := gen_random_uuid();
  v_nd         uuid := gen_random_uuid();
  v_nca        uuid := gen_random_uuid();
  v_rec        uuid := gen_random_uuid();
  v_rec2       uuid := gen_random_uuid();
  v_c          public.comprobante;
  v_j          json;
  rechazado    boolean;
begin
  select u.auth_user_id into v_admin_auth from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  select id into v_terminal from public.terminal where activo and eliminado_en is null limit 1;
  select id into v_cliente from public.cliente where eliminado_en is null and cuenta_corriente limit 1;
  select c.* into v_factura from public.comprobante c join public.tipo_comprobante t on t.id = c.tipo_comprobante_id
   where t.familia = 'factura' and c.estado = 'autorizado' and c.total > 100 order by c.fecha desc limit 1;
  select id into v_caja from public.caja where estado = 'abierta' limit 1;
  select id into v_efectivo from public.medio_pago where tipo = 'efectivo' and activo and eliminado_en is null and afecta_caja limit 1;
  select id into v_transf from public.medio_pago where tipo = 'transferencia' and activo and eliminado_en is null limit 1;
  perform pg_temp.comprobar(v_admin_auth is not null and v_cliente is not null and v_factura.id is not null
    and v_efectivo is not null, 'hay usuario, cliente, factura y efectivo para probar');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth)::text, true);
  perform set_config('request.headers', json_build_object('x-gross-terminal', v_terminal)::text, true);

  -- 1. Nota de crédito libre: dos renglones, uno al 21 % y uno exento.
  select coalesce(saldo, 0) into v_saldo from public.cuenta_corriente_saldo where cliente_id = v_cliente;
  v_saldo := coalesce(v_saldo, 0);
  perform public.emitir_nota_manual(v_nc, 'nota_credito', v_cliente, null,
    '[{"descripcion":"Bonificación","importe":121,"alicuota_iva_id":5},{"descripcion":"Ajuste exento","importe":10}]'::jsonb,
    'Prueba de nota libre');
  select * into v_c from public.comprobante where id = v_nc;
  perform pg_temp.comprobar(v_c.total = 131 and v_c.neto_gravado = 100 and v_c.iva_total = 21 and v_c.exento = 10,
    'la nota libre calcula neto, IVA y exento');
  perform pg_temp.comprobar((select familia from public.tipo_comprobante where id = v_c.tipo_comprobante_id) = 'nota_credito',
    'es una nota de crédito');
  perform pg_temp.comprobar(v_c.estado = 'pendiente' and v_c.observaciones = 'Prueba de nota libre', 'queda pendiente de CAE, con el motivo');
  perform pg_temp.comprobar((select count(*) from public.comprobante_linea where comprobante_id = v_nc) = 2, 'guarda los dos renglones');
  perform pg_temp.comprobar((select count(*) from public.comprobante_alicuota where comprobante_id = v_nc) = 1, 'una alícuota');
  perform pg_temp.comprobar(not exists (select 1 from public.comprobante_asociado where comprobante_id = v_nc), 'sin factura asociada');
  perform pg_temp.comprobar((select saldo from public.cuenta_corriente_saldo where cliente_id = v_cliente) = v_saldo - 131,
    'la nota de crédito resta en la cuenta');

  -- 2. Apretar dos veces no saca otro número.
  perform public.emitir_nota_manual(v_nc, 'nota_credito', v_cliente, null, '[{"descripcion":"x","importe":1}]'::jsonb, 'otra vez');
  perform pg_temp.comprobar((select total from public.comprobante where id = v_nc) = 131
    and (select saldo from public.cuenta_corriente_saldo where cliente_id = v_cliente) = v_saldo - 131, 'repetir contesta la misma nota');

  -- 3. Nota de débito libre: suma.
  perform public.emitir_nota_manual(v_nd, 'nota_debito', v_cliente, null,
    '[{"descripcion":"Intereses","importe":50,"alicuota_iva_id":5}]'::jsonb, 'Intereses por mora');
  perform pg_temp.comprobar((select familia from public.tipo_comprobante t join public.comprobante c on c.tipo_comprobante_id = t.id where c.id = v_nd) = 'nota_debito',
    'es una nota de débito');
  perform pg_temp.comprobar((select saldo from public.cuenta_corriente_saldo where cliente_id = v_cliente) = v_saldo - 81,
    'la nota de débito suma en la cuenta');

  -- 4. Asociada a una factura: toma su receptor y su letra, y la asocia.
  perform public.emitir_nota_manual(v_nca, 'nota_credito', null, v_factura.id,
    '[{"descripcion":"Descuento","importe":10,"alicuota_iva_id":5}]'::jsonb, 'Descuento acordado');
  select * into v_c from public.comprobante where id = v_nca;
  perform pg_temp.comprobar(v_c.receptor_nombre = v_factura.receptor_nombre and v_c.punto_venta_id = v_factura.punto_venta_id,
    'la asociada copia el receptor y el punto de venta');
  perform pg_temp.comprobar((select asociado_id from public.comprobante_asociado where comprobante_id = v_nca) = v_factura.id,
    'queda asociada a la factura');

  -- 5. No más que la factura.
  begin
    rechazado := false;
    perform public.emitir_nota_manual(gen_random_uuid(), 'nota_credito', null, v_factura.id,
      json_build_array(json_build_object('descripcion', 'De más', 'importe', v_factura.total))::jsonb, 'De más');
  exception when others then rechazado := sqlerrm like 'La factura es por%';
  end;
  perform pg_temp.comprobar(rechazado, 'una nota de crédito no supera lo facturado');

  -- 6. Sin motivo o sin renglones, no.
  begin rechazado := false;
    perform public.emitir_nota_manual(gen_random_uuid(), 'nota_credito', v_cliente, null, '[{"descripcion":"a","importe":1}]'::jsonb, '');
  exception when others then rechazado := true; end;
  perform pg_temp.comprobar(rechazado, 'pide el motivo');
  begin rechazado := false;
    perform public.emitir_nota_manual(gen_random_uuid(), 'nota_credito', v_cliente, null, '[{"descripcion":"a","importe":0}]'::jsonb, 'Motivo');
  exception when others then rechazado := true; end;
  perform pg_temp.comprobar(rechazado, 'no acepta importe cero');

  -- 7. Recibo libre a nombre escrito, en efectivo: entra a la caja.
  if v_caja is not null then
    v_esperado := app.efectivo_esperado(v_caja);
    v_j := public.emitir_recibo_libre(v_rec, null, 'Juan Pérez', '20123456', v_efectivo, 5000, v_caja, 'Seña de la operación');
    perform pg_temp.comprobar((v_j->>'repetido')::boolean = false, 'emite el recibo libre');
    perform pg_temp.comprobar(app.efectivo_esperado(v_caja) = v_esperado + 5000, 'el efectivo entra a la caja');
    perform pg_temp.comprobar(not exists (select 1 from public.movimiento_cuenta_corriente m
      join public.recibo_pago rp on rp.movimiento_id = m.id where rp.recibo_id = v_rec), 'no toca ninguna cuenta');
    v_j := public.recibo_completo(v_rec);
    perform pg_temp.comprobar(v_j->>'cliente_nombre' = 'Juan Pérez' and (v_j->>'libre')::boolean and v_j->>'saldo_despues' is null,
      'el recibo muestra el nombre escrito y ningún saldo');
    perform pg_temp.comprobar(exists (select 1 from public.listar_recibos('Juan Pérez', 10) where id = v_rec and libre),
      'aparece en el registro de recibos');

    -- 8. Anularlo saca la plata del cajón y no le suma deuda a nadie.
    perform public.anular_recibo(v_rec, 'Prueba de anulación', v_caja);
    perform pg_temp.comprobar(app.efectivo_esperado(v_caja) = v_esperado, 'anularlo saca la plata del cajón');
  end if;

  -- 9. Recibo libre a un cliente de la lista, con transferencia: su cuenta no cambia.
  if v_transf is not null then
    select saldo into v_saldo from public.cuenta_corriente_saldo where cliente_id = v_cliente;
    perform public.emitir_recibo_libre(v_rec2, v_cliente, null, null, v_transf, 300, v_caja, 'Pago parcial de la cirugía');
    perform pg_temp.comprobar((select saldo from public.cuenta_corriente_saldo where cliente_id = v_cliente) = v_saldo,
      'el recibo libre de un cliente no cambia su cuenta');
    perform pg_temp.comprobar((select cliente_id from public.recibo where id = v_rec2) = v_cliente, 'queda a nombre del cliente');
  end if;

  -- 10. Ni cuenta corriente ni sin nombre.
  begin rechazado := false;
    perform public.emitir_recibo_libre(gen_random_uuid(), null, '  ', null, v_efectivo, 10, v_caja, 'Algo');
  exception when others then rechazado := true; end;
  perform pg_temp.comprobar(rechazado, 'pide a nombre de quién');
  begin rechazado := false;
    perform public.emitir_recibo_libre(gen_random_uuid(), null, 'Ana', null,
      (select id from public.medio_pago where tipo = 'cuenta_corriente' limit 1), 10, v_caja, 'Algo');
  exception when others then rechazado := true; end;
  perform pg_temp.comprobar(rechazado, 'no se paga con cuenta corriente');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
