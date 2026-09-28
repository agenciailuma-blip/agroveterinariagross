-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE «FACTURAR DESPUÉS», CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; todo lo demás corre como un
-- Administrador de verdad, con las políticas de la base.
--
-- Números: ventas de $302.500 con IVA al 21% son $250.000 de neto. Cada
-- una sola da $8.275 de percepción, bajo el mínimo de $24.000; tres
-- juntas son $750.000 de neto y $24.825, arriba. Es justo el caso en el
-- que las dos lecturas de la percepción agrupada dan distinto.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.venta(p_codigo text, p_cliente uuid, p_precio numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.venta (codigo, cliente_id, estado)
  values (p_codigo, p_cliente, 'en_caja') returning id into v;
  insert into public.venta_linea (venta_id, codigo_producto, descripcion, cantidad,
    precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva)
  values (v, 'PRUEBA', 'Prueba facturar después', 1, p_precio, p_precio, p_precio, 5, 'gravado');
  return v;
end $$;

-- Deja la venta para facturar después y la cobra a cuenta corriente.
create function pg_temp.a_cuenta(p_venta uuid, p_importe numeric)
returns void language plpgsql as $$
begin
  perform public.marcar_documentacion_venta(p_venta, 'a_facturar');
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (p_venta, (select id from public.medio_pago where tipo = 'cuenta_corriente' and activo limit 1), p_importe);
  perform public.cobrar_venta(p_venta);
end $$;

create function pg_temp.saldo(p_cliente uuid) returns numeric language sql as $$
  select coalesce(sum(importe), 0) from public.movimiento_cuenta_corriente where cliente_id = p_cliente
$$;

-- Lo que haría ARCA: darle el CAE.
create function pg_temp.autorizar(p_comprobante uuid)
returns void language sql as $$
  update public.comprobante set estado = 'autorizado', cae = '99999999999999',
         cae_vencimiento = current_date + 10, autorizado_en = now()
  where id = p_comprobante
$$;

do $$
declare
  v_admin uuid; v_ri uuid; v_sin uuid; v_otro uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid; v7 uuid;
  v_id uuid; v_comp public.comprobante; v_linea uuid; v_dev uuid; v_nc public.comprobante;
  v_antes numeric;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, cuenta_corriente)
    values ('PRUEBA MAYORISTA RI', 1, 80, '30999999995', true) returning id into v_ri;
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, cuenta_corriente)
    values ('PRUEBA SIN CUENTA', 1, 80, '30888888885', false) returning id into v_sin;
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, cuenta_corriente)
    values ('PRUEBA OTRO RI', 1, 80, '30777777775', true) returning id into v_otro;

  v1 := pg_temp.venta('PRUEBA-FD-1', v_ri, 302500);
  v2 := pg_temp.venta('PRUEBA-FD-2', v_ri, 302500);
  v3 := pg_temp.venta('PRUEBA-FD-3', v_ri, 302500);
  v4 := pg_temp.venta('PRUEBA-FD-4', v_ri, 302500);
  v5 := pg_temp.venta('PRUEBA-FD-5', v_otro, 302500);
  v6 := pg_temp.venta('PRUEBA-FD-6', v_ri, 1210000);
  v7 := pg_temp.venta('PRUEBA-FD-7', v_sin, 302500);

  perform set_config('role', 'authenticated', true);

  -- ─── 1. Sólo quien tiene cuenta corriente, y entera a la cuenta ───
  begin
    perform public.marcar_documentacion_venta(v7, 'a_facturar');
    perform pg_temp.comprobar(false, 'se dejó para facturar después a un cliente sin cuenta corriente');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%no tiene cuenta corriente%', sqlerrm);
  end;

  perform public.marcar_documentacion_venta(v1, 'a_facturar');
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (v1, (select id from public.medio_pago where tipo = 'efectivo' and activo limit 1), 302500);
  begin
    perform public.cobrar_venta(v1);
    perform pg_temp.comprobar(false, 'una venta para facturar después se cobró en efectivo');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm = 'Una venta para facturar después va entera a cuenta corriente.', sqlerrm);
  end;
  perform set_config('role', 'none', true);
  delete from public.venta_pago where venta_id = v1;
  perform set_config('role', 'authenticated', true);

  -- ─── 2. Se cobra sin percepción y queda en la cuenta ───
  perform pg_temp.a_cuenta(v1, 302500);
  perform pg_temp.a_cuenta(v2, 302500);
  perform pg_temp.a_cuenta(v3, 302500);
  perform pg_temp.comprobar((select percepcion_iibb = 0 from public.venta where id = v1),
    'una venta para facturar después se cobró con percepción');
  perform pg_temp.comprobar(pg_temp.saldo(v_ri) = 907500, 'la cuenta no quedó con las tres ventas: ' || pg_temp.saldo(v_ri));

  begin
    perform public.preparar_comprobante(v1);
    perform pg_temp.comprobar(false, 'una venta para facturar después se facturó suelta, sin cargar la percepción');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Esta venta es para facturar después%', sqlerrm);
  end;

  perform pg_temp.comprobar(
    (select count(*) = 3 from public.vista_venta_por_facturar where cliente_id = v_ri),
    'las tres ventas no aparecen en «Por facturar»');

  -- ─── 3. Tres ventas, una factura, y la percepción del total a la cuenta ───
  begin
    perform public.facturar_ventas_pendientes(array[v1, v5]);
    perform pg_temp.comprobar(false, 'se facturaron juntas ventas de dos clientes');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Alguna de las ventas no está para facturar%' or sqlerrm like 'Una factura es de un solo cliente%', sqlerrm);
  end;

  v_id := public.facturar_ventas_pendientes(array[v1, v2, v3]);
  select * into v_comp from public.comprobante where id = v_id;
  perform pg_temp.comprobar(v_comp.venta_id is null and v_comp.neto_gravado = 750000 and v_comp.iva_total = 157500,
    'la factura agrupada no suma las tres ventas');
  perform pg_temp.comprobar(v_comp.tributos_total = 24825 and v_comp.total = 932325,
    'la percepción no se calculó sobre el total de la factura: ' || v_comp.tributos_total);
  perform pg_temp.comprobar((select count(*) = 3 from public.comprobante_venta where comprobante_id = v_id),
    'la factura no quedó atada a sus tres ventas');
  perform pg_temp.comprobar(pg_temp.saldo(v_ri) = 932325,
    'la percepción no entró a la cuenta: la deuda no es la factura entera');
  perform pg_temp.comprobar(not exists (select 1 from public.vista_venta_por_facturar where id = any(array[v1, v2, v3])),
    'las ventas facturadas siguen en «Por facturar»');

  begin
    perform public.facturar_ventas_pendientes(array[v1]);
    perform pg_temp.comprobar(false, 'se facturó dos veces la misma venta');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Alguna de las ventas no está para facturar%', sqlerrm);
  end;

  -- ─── 4. Devolver una venta de la factura agrupada ───
  perform set_config('role', 'none', true);
  perform pg_temp.autorizar(v_id);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.anular_venta_con_nota_credito(v3, 'Prueba');
    perform pg_temp.comprobar(false, 'se anuló entera una venta de una factura agrupada');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Esta venta está en una factura que agrupa varias%', sqlerrm);
  end;

  v_antes := pg_temp.saldo(v_ri);
  select id into v_linea from public.venta_linea where venta_id = v2;
  v_dev := public.devolver_lineas_de_venta(v2, jsonb_build_array(jsonb_build_object('venta_linea_id', v_linea, 'cantidad', 1)), 'Prueba');
  select c.* into v_nc from public.comprobante c join public.devolucion d on d.comprobante_id = c.id where d.id = v_dev;
  perform pg_temp.comprobar(v_nc.id is not null, 'devolver una venta de la factura agrupada no emitió nota de crédito');
  perform pg_temp.comprobar(v_nc.tributos_total = 8275 and v_nc.total = 310775,
    'la nota de crédito no devuelve la parte de la percepción: ' || v_nc.tributos_total);
  perform pg_temp.comprobar(
    exists (select 1 from public.comprobante_asociado where comprobante_id = v_nc.id and asociado_id = v_id),
    'la nota de crédito no quedó asociada a la factura agrupada');
  perform pg_temp.comprobar(pg_temp.saldo(v_ri) = v_antes - 310775,
    'la cuenta no bajó por lo devuelto más su percepción');

  -- ─── 5. Con la otra lectura, venta por venta, no hay percepción ───
  perform set_config('role', 'none', true);
  update public.configuracion set valor = '"por_venta"'::jsonb where clave = 'arca.iibb_percepcion_factura_agrupada';
  perform set_config('role', 'authenticated', true);
  perform pg_temp.a_cuenta(v4, 302500);
  v_id := public.facturar_ventas_pendientes(array[v4]);
  perform pg_temp.comprobar((select tributos_total = 0 from public.comprobante where id = v_id),
    'venta por venta, una venta bajo el mínimo llevó percepción');
  perform set_config('role', 'none', true);
  update public.configuracion set valor = '"por_factura"'::jsonb where clave = 'arca.iibb_percepcion_factura_agrupada';
  perform set_config('role', 'authenticated', true);

  -- ─── 6. Una sola venta, facturada después y devuelta entera ───
  perform pg_temp.a_cuenta(v6, 1210000);
  v_antes := pg_temp.saldo(v_ri);
  v_id := public.facturar_ventas_pendientes(array[v6]);
  select * into v_comp from public.comprobante where id = v_id;
  perform pg_temp.comprobar(v_comp.venta_id = v6 and v_comp.tributos_total = 33100,
    'la factura de una sola venta no la lleva como propia, o no tiene su percepción');
  perform pg_temp.comprobar(pg_temp.saldo(v_ri) = v_antes + 33100, 'la percepción no entró a la cuenta');

  perform set_config('role', 'none', true);
  perform pg_temp.autorizar(v_id);
  perform set_config('role', 'authenticated', true);
  perform public.anular_venta_con_nota_credito(v6, 'Prueba');
  perform pg_temp.comprobar(pg_temp.saldo(v_ri) = v_antes - 1210000,
    'devolverla entera dejó la percepción en la cuenta: ' || (pg_temp.saldo(v_ri) - (v_antes - 1210000)));

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
