-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA PERCEPCIÓN DE IIBB EN LA CAJA, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; el cobro y la factura corren
-- como un Administrador de verdad, con las políticas de la base.
--
-- Lo que se cuida: que lo cobrado y la factura digan lo mismo, que la
-- deuda en cuenta corriente sea la factura entera, y que la web y las
-- cajas viejas —que cobran sin percepción— sigan pudiendo cobrar.
--
-- Números: alícuota 3,31% y mínimo $24.000 (Configuración). Un producto
-- de $1.210.000 con IVA al 21% tiene $1.000.000 de neto: percepción de
-- $33.100, arriba del mínimo.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Una venta en caja con un solo renglón al 21%.
create function pg_temp.venta(p_codigo text, p_cliente uuid, p_precio numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.venta (codigo, cliente_id, estado, documentacion)
  values (p_codigo, p_cliente, 'en_caja', 'fiscal') returning id into v;
  insert into public.venta_linea (venta_id, codigo_producto, descripcion, cantidad,
    precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva)
  values (v, 'PRUEBA', 'Prueba percepción', 1, p_precio, p_precio, p_precio, 5, 'gravado');
  return v;
end $$;

create function pg_temp.pagar(p_venta uuid, p_tipo text, p_importe numeric)
returns void language sql as $$
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (p_venta, (select id from public.medio_pago where tipo = p_tipo and activo limit 1), p_importe)
$$;

do $$
declare
  v_admin uuid;
  v_ri    uuid;
  v_cf    uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid;
  v_comp  public.comprobante;
  v_id    uuid;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  perform pg_temp.comprobar(
    (select (valor #>> '{}')::numeric from public.configuracion where clave = 'arca.iibb_percepcion_alicuota') = 3.31
    and (select (valor #>> '{}')::numeric from public.configuracion where clave = 'arca.iibb_percepcion_minimo') = 24000,
    'la alícuota o el mínimo de Configuración no son los que supone la prueba');

  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, cuenta_corriente)
    values ('PRUEBA MAYORISTA RI', 1, 80, '30999999995', true) returning id into v_ri;
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento)
    values ('PRUEBA CONSUMIDOR', 5, 96, '99999999') returning id into v_cf;

  v1 := pg_temp.venta('PRUEBA-PERC-1', v_ri, 1210000);
  v2 := pg_temp.venta('PRUEBA-PERC-2', v_ri, 1210000);
  v3 := pg_temp.venta('PRUEBA-PERC-3', v_ri, 1210000);
  v4 := pg_temp.venta('PRUEBA-PERC-4', v_ri, 1210000);
  v5 := pg_temp.venta('PRUEBA-PERC-5', v_cf, 1210000);
  v6 := pg_temp.venta('PRUEBA-PERC-6', v_ri, 60500);   -- percepción de $1.655: bajo el mínimo

  perform set_config('role', 'authenticated', true);

  -- ─── 1. Lo que la caja pregunta antes de cobrar ───
  perform pg_temp.comprobar(public.percepcion_de_venta(v1) = 33100,
    'a un RI con $1.000.000 de neto no le corresponden $33.100: da ' || public.percepcion_de_venta(v1));
  perform pg_temp.comprobar(public.percepcion_de_venta(v5) = 0, 'a un consumidor final le corresponde percepción');
  perform pg_temp.comprobar(public.percepcion_de_venta(v6) = 0, 'se percibe por debajo del mínimo');

  -- ─── 2. Paga en el momento: se cobra entera, y la factura dice lo mismo ───
  perform pg_temp.pagar(v1, 'efectivo', 1243100);
  perform public.cobrar_venta(v1);
  perform pg_temp.comprobar((select percepcion_iibb = 33100 and total = 1210000 from public.venta where id = v1),
    'la venta no guardó la percepción cobrada, o se la sumó al total de lo vendido');

  -- En una variable: dentro del where se ejecutaría una vez por fila.
  v_id := public.preparar_comprobante(v1);
  select * into v_comp from public.comprobante where id = v_id;
  perform pg_temp.comprobar(v_comp.total = 1243100 and v_comp.tributos_total = 33100,
    'la factura no dice lo que se cobró: ' || v_comp.total);

  -- ─── 3. A cuenta corriente: la deuda es la factura entera ───
  perform pg_temp.pagar(v2, 'cuenta_corriente', 1243100);
  perform public.cobrar_venta(v2);
  perform pg_temp.comprobar(
    (select importe = 1243100 from public.movimiento_cuenta_corriente
      where referencia_tipo = 'venta' and referencia_id = v2),
    'la deuda en cuenta corriente no incluye la percepción');

  -- ─── 4. Sin percepción, como la web o una caja vieja: entra igual ───
  perform pg_temp.pagar(v3, 'efectivo', 1210000);
  perform public.cobrar_venta(v3);
  perform pg_temp.comprobar((select percepcion_iibb = 0 and estado = 'cobrada' from public.venta where id = v3),
    'una venta cobrada sin percepción no entró, o figura con percepción cobrada');
  -- En una variable: dentro del where se ejecutaría una vez por fila.
  v_id := public.preparar_comprobante(v3);
  select * into v_comp from public.comprobante where id = v_id;
  perform pg_temp.comprobar(v_comp.total = 1243100,
    'la factura de una venta cobrada sin percepción dejó de llevarla (el freno de la web depende de esto)');

  -- ─── 5. Un pago que no cierra con ninguna de las dos dice cuánto cobrar ───
  perform pg_temp.pagar(v4, 'efectivo', 1220000);
  begin
    perform public.cobrar_venta(v4);
    perform pg_temp.comprobar(false, 'se cobró con pagos que no cierran');
  exception when raise_exception then
    perform pg_temp.comprobar(
      sqlerrm = 'Los pagos suman $ 1.220.000,00 y hay que cobrar $ 1.243.100,00 ($ 1.210.000,00 de la venta más $ 33.100,00 de percepción de IIBB).',
      sqlerrm);
  end;

  -- ─── 6. A quien no le corresponde, se cobra el total y nada más ───
  perform pg_temp.pagar(v5, 'efectivo', 1210000);
  perform public.cobrar_venta(v5);
  perform pg_temp.comprobar((select percepcion_iibb = 0 from public.venta where id = v5), 'se le cobró percepción a un consumidor final');

  perform pg_temp.pagar(v6, 'efectivo', 60500);
  perform public.cobrar_venta(v6);
  perform pg_temp.comprobar((select percepcion_iibb = 0 from public.venta where id = v6), 'se cobró percepción bajo el mínimo');

  -- ─── 7. Si cambia la alícuota entre el cobro y la factura, manda lo cobrado ───
  perform set_config('role', 'none', true);
  update public.configuracion set valor = '5'::jsonb where clave = 'arca.iibb_percepcion_alicuota';
  perform set_config('role', 'authenticated', true);
  -- En una variable: dentro del where se ejecutaría una vez por fila.
  v_id := public.preparar_comprobante(v2);
  select * into v_comp from public.comprobante where id = v_id;
  perform pg_temp.comprobar(v_comp.total = 1243100 and v_comp.tributos_total = 33100,
    'la factura recalculó la percepción en vez de usar la que se cobró: ' || v_comp.tributos_total);

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
