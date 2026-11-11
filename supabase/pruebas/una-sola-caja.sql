-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA CAJA ÚNICA DEL LOCAL, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Va con 20261111100000_una_sola_caja_para_el_local.sql y
-- 20261111100100_una_sola_caja_abierta.sql. Usa dos PIN de prueba, de
-- ocho cifras para no chocar con los reales: uno de un Encargado (puede
-- abrir y cerrar) y uno de un Vendedor (no puede). Si ya hay una caja
-- abierta, la cierra dentro de la prueba; al final se deshace todo.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_auth      uuid;
  v_encargado uuid;
  v_vendedor  uuid;
  v_terminal  uuid;
  v_abierta   uuid;
  r           json;
  v_caja      uuid;
  v_res       jsonb;
  rechazado   boolean;
begin
  select u.id into v_encargado from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Encargado' and u.activo and u.eliminado_en is null limit 1;
  select u.id into v_vendedor from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Vendedor' and u.activo and u.eliminado_en is null limit 1;
  perform pg_temp.comprobar(v_encargado is not null and v_vendedor is not null, 'hace falta un Encargado y un Vendedor');

  insert into app.usuario_pin (usuario_id, pin_hash) values
    (v_encargado, extensions.crypt('90817263', extensions.gen_salt('bf'))),
    (v_vendedor,  extensions.crypt('81726354', extensions.gen_salt('bf')))
  on conflict (usuario_id) do update set pin_hash = excluded.pin_hash, intentos = 0, bloqueado_hasta = null;

  select id into v_terminal from public.terminal where tipo = 'caja' and eliminado_en is null order by nombre limit 1;

  -- La sesión: el usuario compartido del local, que cobra pero no abre ni cierra.
  select u.auth_user_id into v_auth from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Cajero' and u.auth_user_id is not null and u.activo limit 1;
  if v_auth is null then
    select u.auth_user_id into v_auth from public.usuario u join public.rol r on r.id = u.rol_id
     where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;
  end if;
  delete from app.intento_pin where auth_user_id = v_auth;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Un PIN equivocado no abre.
  r := public.abrir_caja(v_terminal, 1000, '00000000');
  perform pg_temp.comprobar(not (r->>'ok')::boolean and r->>'error' like '%PIN no es correcto%', 'un PIN equivocado abrió la caja');

  -- 2. El PIN de un vendedor no abre.
  r := public.abrir_caja(v_terminal, 1000, '81726354');
  perform pg_temp.comprobar(not (r->>'ok')::boolean and r->>'error' like '%no puede abrir%', 'un vendedor abrió la caja');

  -- 3. Con una caja abierta, no se abre otra: lo dice y dice quién.
  select id into v_abierta from public.caja where estado = 'abierta' limit 1;
  if v_abierta is not null then
    r := public.abrir_caja(v_terminal, 1000, '90817263');
    perform pg_temp.comprobar(not (r->>'ok')::boolean and r->>'error' like 'La caja ya está abierta%', 'se abrió una segunda caja');

    -- 4. El vendedor no la cierra; el encargado sí, y queda anotado.
    r := public.cerrar_caja_con_pin(v_abierta, 0, '81726354');
    perform pg_temp.comprobar(not (r->>'ok')::boolean and r->>'error' like '%no puede cerrar%', 'un vendedor cerró la caja');
    r := public.cerrar_caja_con_pin(v_abierta, 0, '90817263');
    perform pg_temp.comprobar((r->>'ok')::boolean, 'el encargado no pudo cerrar: ' || coalesce(r->>'error', ''));
    perform pg_temp.comprobar(
      (select cerrada_por = v_encargado and estado = 'cerrada' from public.caja where id = v_abierta),
      'la caja cerrada no dice quién la cerró');
    perform pg_temp.comprobar(
      (select resumen_al_cerrar->'caja'->>'cerro' = (select nombre from public.usuario where id = v_encargado)
         from public.caja where id = v_abierta),
      'el resumen guardado no dice quién cerró');
  end if;

  -- 5. El encargado abre; queda a su nombre.
  r := public.abrir_caja(v_terminal, 1500, '90817263');
  perform pg_temp.comprobar((r->>'ok')::boolean, 'el encargado no pudo abrir: ' || coalesce(r->>'error', ''));
  v_caja := (r->'caja'->>'id')::uuid;
  perform pg_temp.comprobar(
    (select cajero_id = v_encargado and monto_inicial = 1500 from public.caja where id = v_caja),
    'la caja abierta no quedó a nombre del encargado');

  -- 6. Quien cobra ve el resumen de la caja abierta, sin el efectivo esperado y con lo cobrado por cada uno.
  v_res := public.resumen_de_caja(v_caja);
  perform pg_temp.comprobar(v_res->'efectivo'->'esperado' = 'null'::jsonb, 'con la caja abierta se ve el efectivo esperado');
  perform pg_temp.comprobar(jsonb_typeof(v_res->'ventas'->'por_cajero') = 'array', 'el resumen no trae lo cobrado por cada uno');

  -- 7. Aunque se saltee la función, la base no deja dos cajas abiertas.
  perform set_config('role', 'postgres', true);
  begin
    insert into public.caja (terminal_id, cajero_id, monto_inicial) values (v_terminal, v_encargado, 0);
    rechazado := false;
  exception when unique_violation then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'la base dejó abrir dos cajas a la vez');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
