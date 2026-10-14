-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA FACTURA EMITIDA CON CAEA, AL SUBIR, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; la subida corre como un
-- Administrador de verdad, con las políticas de la base. Es lo que
-- faltaba: el 01/10 la primera factura del punto de venta CAEA no subió
-- porque el usuario no podía crear la fila de la serie, y corriendo
-- como dueño eso no se ve.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.factura(p_id uuid, p_venta uuid, p_pv uuid, p_numero bigint, p_caea uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'venta_id', p_venta, 'punto_venta_id', p_pv,
    'tipo_comprobante_id', 6, 'numero', p_numero, 'caea_id', p_caea,
    'receptor_nombre', 'Consumidor Final', 'receptor_tipo_documento_id', 99,
    'receptor_documento', '0', 'receptor_condicion_iva_id', 5,
    'fecha', current_date, 'neto_gravado', 1000, 'exento', 0,
    'iva_total', 210, 'tributos_total', 0, 'total', 1210,
    'cae', '86390929372477', 'cae_vencimiento', current_date + 14,
    'alicuotas', jsonb_build_array(jsonb_build_object(
      'alicuota_iva_id', 5, 'base_imponible', 1000, 'importe', 210)),
    'motivo', 'Prueba')
$$;

do $$
declare
  v_admin uuid;
  v_cf    uuid;
  v_pv    uuid;
  v_caea  uuid;
  v1 uuid; v2 uuid;
  f1 uuid := gen_random_uuid();
  f2 uuid := gen_random_uuid();
  v_ultimo bigint;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');

  select id into v_cf from public.cliente where nombre ilike 'consumidor final%' limit 1;
  select id into v_caea from public.caea order by fecha_hasta desc limit 1;
  perform pg_temp.comprobar(v_caea is not null, 'no hay ningún CAEA para probar');

  -- Un punto de venta CAEA recién creado: su serie todavía no existe,
  -- que es justo el caso de la primera factura emitida en un corte.
  insert into public.punto_venta (numero, nombre, regimen_caea, activo)
  values (9999, 'PRUEBA CAEA', true, true) returning id into v_pv;

  insert into public.venta (codigo, cliente_id, estado) values ('PRUEBA-CAEA-1', v_cf, 'cobrada') returning id into v1;
  insert into public.venta (codigo, cliente_id, estado) values ('PRUEBA-CAEA-2', v_cf, 'cobrada') returning id into v2;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ─── 1. La primera factura de una serie nueva sube y crea la serie ───
  perform public.registrar_comprobante_caea(pg_temp.factura(f1, v1, v_pv, 1, v_caea));
  perform pg_temp.comprobar(exists (select 1 from public.comprobante where id = f1),
    'la primera factura de la serie no quedó en el servidor');
  select ultimo_numero into v_ultimo from public.secuencia_comprobante
  where punto_venta_id = v_pv and tipo_comprobante_id = 6;
  perform pg_temp.comprobar(v_ultimo = 1, 'la serie no quedó en 1: ' || coalesce(v_ultimo::text, 'no existe'));

  -- ─── 2. La siguiente sube la serie que ya existe ───
  perform public.registrar_comprobante_caea(pg_temp.factura(f2, v2, v_pv, 2, v_caea));
  select ultimo_numero into v_ultimo from public.secuencia_comprobante
  where punto_venta_id = v_pv and tipo_comprobante_id = 6;
  perform pg_temp.comprobar(v_ultimo = 2, 'la serie no subió a 2: ' || coalesce(v_ultimo::text, 'no existe'));

  -- ─── 3. Reenviar la primera no duplica ni baja la serie ───
  perform public.registrar_comprobante_caea(pg_temp.factura(f1, v1, v_pv, 1, v_caea));
  perform pg_temp.comprobar((select count(*) from public.comprobante where punto_venta_id = v_pv) = 2,
    'el reenvío duplicó la factura');
  select ultimo_numero into v_ultimo from public.secuencia_comprobante
  where punto_venta_id = v_pv and tipo_comprobante_id = 6;
  perform pg_temp.comprobar(v_ultimo = 2, 'el reenvío bajó la serie a ' || v_ultimo);

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
