-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL ESTADO DE LAS PC, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Va con 20261119100000_estado_de_las_pc.sql.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_auth     uuid;
  v_terminal uuid;
  v_otra     uuid;
  v_otra_ver text;
  t          record;
  rechazado  boolean;
begin
  select id into v_terminal from public.terminal where activo and eliminado_en is null order by nombre limit 1;
  select id, version_app into v_otra, v_otra_ver from public.terminal
   where activo and eliminado_en is null and id <> v_terminal order by nombre limit 1;
  perform pg_temp.comprobar(v_terminal is not null and v_otra is not null, 'hacen falta dos puestos');

  -- Sin sesión, no.
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.informar_estado_pc(v_terminal, '9.9.9', '{"programa":"escritorio"}');
    rechazado := false;
  exception when others then rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'sin sesión no se puede informar');

  -- Con un usuario cualquiera del sistema, sí.
  select u.auth_user_id into v_auth from public.usuario u
   where u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth)::text, true);

  perform public.informar_estado_pc(v_terminal, ' 9.9.9 ',
    '{"programa":"escritorio","impresora":"POS80","impresora_encontrada":true,"sin_enviar":3}');
  select * into t from public.terminal where id = v_terminal;
  perform pg_temp.comprobar(t.version_app = '9.9.9', 'guarda la versión, sin espacios');
  perform pg_temp.comprobar((t.estado_pc->>'sin_enviar')::int = 3, 'guarda el estado');
  perform pg_temp.comprobar(t.estado_informado_en > now() - interval '1 minute', 'anota cuándo');

  -- No toca otro puesto.
  perform pg_temp.comprobar(
    (select version_app is not distinct from v_otra_ver from public.terminal where id = v_otra),
    'no cambia otro puesto');

  -- El siguiente informe pisa al anterior entero.
  perform public.informar_estado_pc(v_terminal, '9.9.10', '{"programa":"navegador"}');
  select * into t from public.terminal where id = v_terminal;
  perform pg_temp.comprobar(t.version_app = '9.9.10' and t.estado_pc = '{"programa":"navegador"}'::jsonb,
    'el informe nuevo reemplaza al anterior');

  -- Lo que no es un objeto, no.
  begin
    perform public.informar_estado_pc(v_terminal, '9.9.9', '[1,2]');
    rechazado := false;
  exception when others then rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'rechaza un estado que no es objeto');

  -- Lo desmedido, no.
  begin
    perform public.informar_estado_pc(v_terminal, '9.9.9', jsonb_build_object('x', repeat('a', 5000)));
    rechazado := false;
  exception when others then rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'rechaza un estado demasiado largo');

  -- Versión vacía queda nula.
  perform public.informar_estado_pc(v_terminal, '  ', '{}');
  perform pg_temp.comprobar((select version_app is null from public.terminal where id = v_terminal),
    'una versión vacía queda nula');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
