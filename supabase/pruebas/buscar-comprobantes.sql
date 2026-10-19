-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA BÚSQUEDA DE COMPROBANTES, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Lee vista_comprobante_busqueda como un Administrador de verdad —con
-- las políticas de la base— y la compara contra la tabla. No crea nada.
-- Hace falta al menos una factura con percepción y una nota de crédito.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_auth uuid;
  n_tabla int; n_vista int; n_distintos int;
  n_perc int; n_perc_tabla int;
  n_nc int; n_nc_mal int;
  v_suma_vista numeric; v_suma_tabla numeric;
  v_sin_sesion int;
begin
  -- Lo que hay en la tabla, mirado como dueño, para comparar.
  select count(*), count(*) filter (where tributos_total > 0) into n_tabla, n_perc_tabla
  from public.comprobante;
  select coalesce(sum(t.signo * c.tributos_total), 0) into v_suma_tabla
  from public.comprobante c join public.tipo_comprobante t on t.id = c.tipo_comprobante_id
  where c.estado in ('autorizado', 'contingencia', 'informado');

  select u.auth_user_id into v_auth
  from public.usuario u
  join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_auth is not null, 'hace falta un Administrador con cuenta');

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 2. El Administrador ve todos los comprobantes, uno por renglón.
  select count(*), count(distinct id) into n_vista, n_distintos from public.vista_comprobante_busqueda;
  perform pg_temp.comprobar(n_vista = n_tabla and n_distintos = n_tabla,
    format('la vista tiene %s renglones (%s distintos) y la tabla %s comprobantes', n_vista, n_distintos, n_tabla));

  -- 3. Las que tienen percepción son las mismas que en la tabla.
  select count(*) into n_perc from public.vista_comprobante_busqueda where tributos_total > 0;
  perform pg_temp.comprobar(n_perc = n_perc_tabla and n_perc > 0,
    format('con percepción: la vista dice %s y la tabla %s', n_perc, n_perc_tabla));

  -- 4. Lo percibido, neto de notas de crédito, da lo mismo que la tabla.
  select coalesce(sum(signo * tributos_total), 0) into v_suma_vista
  from public.vista_comprobante_busqueda where estado in ('autorizado', 'contingencia', 'informado');
  perform pg_temp.comprobar(v_suma_vista = v_suma_tabla,
    format('lo percibido da %s en la vista y %s en la tabla', v_suma_vista, v_suma_tabla));

  -- 5 y 6. Las notas de crédito llegan con signo −1, las facturas con +1.
  select count(*), count(*) filter (where signo <> -1) into n_nc, n_nc_mal
  from public.vista_comprobante_busqueda where familia = 'nota_credito';
  perform pg_temp.comprobar(n_nc > 0 and n_nc_mal = 0, format('%s notas de crédito, %s sin signo −1', n_nc, n_nc_mal));
  perform pg_temp.comprobar(not exists (
    select 1 from public.vista_comprobante_busqueda where familia = 'factura' and signo <> 1),
    'hay una factura con signo distinto de +1');

  -- 7. Los importes llegan positivos: el signo lo aplica la pantalla.
  perform pg_temp.comprobar(not exists (
    select 1 from public.vista_comprobante_busqueda where total < 0 or tributos_total < 0 or neto_gravado < 0),
    'hay importes negativos en la vista');

  -- 8. Buscar por número y punto de venta da uno solo por tipo.
  perform pg_temp.comprobar(not exists (
    select 1 from public.vista_comprobante_busqueda
    where estado <> 'anulado'
    group by punto_venta, tipo, numero having count(*) > 1),
    'un mismo número aparece dos veces en el mismo punto de venta y tipo');

  -- 9. Sin sesión no se ve nada.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into v_sin_sesion from public.vista_comprobante_busqueda;
  exception when insufficient_privilege then
    v_sin_sesion := 0;
  end;
  perform pg_temp.comprobar(v_sin_sesion = 0, format('sin sesión se ven %s comprobantes', v_sin_sesion));

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
