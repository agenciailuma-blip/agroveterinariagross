-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL INSCRIPTO CON COMPROBANTE INTERNO, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Pedido de Lucas del 20/10: en la caja, factura o comprobante interno,
-- también para un Responsable Inscripto. El permiso sigue mandando.
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
  values (v, 'PRUEBA', 'Prueba inscripto sin factura', 1, p_precio, p_precio, p_precio, 5, 'gravado');
  return v;
end $$;

do $$
declare
  v_admin uuid; v_ri uuid; v1 uuid; v2 uuid; v3 uuid;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');

  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento, cuenta_corriente)
    values ('PRUEBA INSCRIPTO SIN FACTURA', 1, 80, '30999999995', true) returning id into v_ri;

  -- $1.210.000 con IVA: con factura le tocaría percepción.
  v1 := pg_temp.venta('PRUEBA-RISF-1', v_ri, 1210000);
  v2 := pg_temp.venta('PRUEBA-RISF-2', v_ri, 1210000);
  v3 := pg_temp.venta('PRUEBA-RISF-3', v_ri, 1210000);

  -- ─── 1 y 2. Con el permiso, el inscripto puede salir con comprobante interno ───
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.marcar_documentacion_venta(v1, 'no_fiscal');
  perform pg_temp.comprobar(
    (select documentacion from public.venta where id = v1) = 'no_fiscal',
    'a un Responsable Inscripto no se le pudo marcar la venta sin factura');

  -- Y se cobra por el total, sin percepción: la percepción va con la factura.
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (v1, (select id from public.medio_pago where tipo = 'efectivo' and activo limit 1), 1210000);
  perform public.cobrar_venta(v1);
  perform pg_temp.comprobar(
    (select estado from public.venta where id = v1) = 'cobrada',
    'la venta sin factura de un inscripto no se pudo cobrar por su total');

  -- ─── 3. Con factura sigue andando como siempre ───
  perform public.marcar_documentacion_venta(v2, 'fiscal');
  perform pg_temp.comprobar(
    (select documentacion from public.venta where id = v2) = 'fiscal',
    'al inscripto ya no se le puede marcar con factura');

  -- ─── 4. Sin el permiso, no: es una decisión del dueño ───
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.marcar_documentacion_venta(v3, 'no_fiscal');
    perform pg_temp.comprobar(false, 'una sesión sin permiso pudo marcar una venta sin factura');
  exception when raise_exception then
    -- Una sesión sin permisos ni siquiera ve la venta: también es un no.
    perform pg_temp.comprobar(sqlerrm like '%No tenes permiso%' or sqlerrm like '%no existe%', sqlerrm);
  end;

  -- ─── 5. Y la regla del permiso sigue escrita en la base ───
  perform pg_temp.comprobar(
    pg_get_functiondef('public.marcar_documentacion_venta(uuid, text)'::regprocedure) like '%facturacion.vender_sin_factura%',
    'marcar sin factura ya no pide el permiso');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
