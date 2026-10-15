-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA TARJETA FUERA DEL ARQUEO, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Guardar se prueba como un Administrador de verdad, por la misma
-- función que usa Precios → Medios de pago.
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
  v_tarjeta public.medio_pago;
  v_efectivo public.medio_pago;
  rechazado boolean;
begin
  -- 1 y 2. Ninguna tarjeta entra al arqueo, y la de crédito sigue con sus cuotas y su lista.
  perform pg_temp.comprobar(not exists (
      select 1 from public.medio_pago
       where tipo in ('tarjeta_credito', 'tarjeta_debito') and afecta_caja),
    'hay una tarjeta que entra al arqueo');

  select * into v_tarjeta from public.medio_pago
   where tipo = 'tarjeta_credito' and eliminado_en is null and activo
   order by orden limit 1;
  perform pg_temp.comprobar(v_tarjeta.id is not null and v_tarjeta.admite_cuotas and v_tarjeta.cuotas_maximas = 3,
    'la tarjeta de crédito perdió sus cuotas');

  select * into v_efectivo from public.medio_pago where tipo = 'efectivo' and eliminado_en is null limit 1;

  select u.auth_user_id into v_auth from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_auth is not null, 'hace falta un Administrador con cuenta');
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 3. Desde Precios no se puede volver a tildar.
  begin
    perform public.guardar_medio_pago(v_tarjeta.id, v_tarjeta.nombre, v_tarjeta.tipo, v_tarjeta.lista_precio_id,
      v_tarjeta.admite_cuotas, v_tarjeta.cuotas_maximas, true, v_tarjeta.orden);
    rechazado := false;
  exception when check_violation then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'Precios dejó volver a tildar el arqueo en la tarjeta de crédito');

  -- 4. Una tarjeta nueva tampoco puede entrar al arqueo.
  begin
    perform public.guardar_medio_pago(null, 'Prueba tarjeta al cajón', 'tarjeta_debito', null, false, 1, true, 99);
    rechazado := false;
  exception when check_violation then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'se pudo crear una tarjeta que entra al arqueo');

  -- 5. Guardarla como está —sin el arqueo— sigue andando.
  perform public.guardar_medio_pago(v_tarjeta.id, v_tarjeta.nombre, v_tarjeta.tipo, v_tarjeta.lista_precio_id,
    v_tarjeta.admite_cuotas, v_tarjeta.cuotas_maximas, false, v_tarjeta.orden);
  perform pg_temp.comprobar(true, 'la tarjeta se guarda sin el arqueo');

  -- 6. Y el efectivo sigue entrando al arqueo: la regla es sólo para tarjetas.
  perform public.guardar_medio_pago(v_efectivo.id, v_efectivo.nombre, v_efectivo.tipo, v_efectivo.lista_precio_id,
    v_efectivo.admite_cuotas, v_efectivo.cuotas_maximas, true, v_efectivo.orden);
  perform pg_temp.comprobar((select afecta_caja from public.medio_pago where id = v_efectivo.id),
    'el efectivo dejó de entrar al arqueo');

  perform set_config('role', 'postgres', true);
  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
