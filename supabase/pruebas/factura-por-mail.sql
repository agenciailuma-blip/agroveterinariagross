-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL REGISTRO DE LA FACTURA POR MAIL, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- El envío de verdad lo hace la función enviar-factura, que se prueba
-- contra Resend; acá, que el registro lo escriba sólo el servidor y lo
-- vea sólo quien ve la facturación.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_admin uuid;
  v_comp  uuid;
  rechazado boolean;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  select id into v_comp from public.comprobante where cae is not null limit 1;
  perform pg_temp.comprobar(v_comp is not null, 'hace falta un comprobante autorizado');

  -- 1. El servidor anota el envío.
  insert into public.comprobante_envio (comprobante_id, destinatario, estado) values (v_comp, 'a@b.com', 'enviado');

  -- 2. El remitente está en la configuración.
  perform pg_temp.comprobar(
    (select valor #>> '{}' from public.configuracion where clave = 'correo.remitente') is not null,
    'falta el remitente del correo en la configuración');

  -- 3. Quien ve la facturación ve el envío.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.comprobar((select count(*) from public.comprobante_envio where comprobante_id = v_comp) >= 1,
    'con permiso no se ve el envío');

  -- 4. Desde la app no se puede anotar un envío que no pasó.
  begin
    insert into public.comprobante_envio (comprobante_id, destinatario, estado) values (v_comp, 'x@y.com', 'enviado');
    rechazado := false;
  exception when others then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'desde la app se pudo anotar un envío');

  -- 5. Sin permiso, no se ven a quién se mandaron las facturas.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform pg_temp.comprobar((select count(*) from public.comprobante_envio) = 0, 'sin permiso se ven los envíos');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
