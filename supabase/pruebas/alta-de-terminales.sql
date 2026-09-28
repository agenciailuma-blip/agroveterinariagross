-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL ALTA DE CAJAS Y MOSTRADORES, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad y como alguien sin cuenta.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Espera un error con el mensaje que corresponde, no «cualquier error».
create function pg_temp.falla(p_sql text, p_mensaje text, p_que text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.comprobar(false, p_que);
exception when raise_exception then
  perform pg_temp.comprobar(sqlerrm like p_mensaje, p_que || ' — dijo: ' || sqlerrm);
end $$;

do $$
declare
  v_admin uuid; v_pv uuid; v_respaldo uuid; v_caja uuid; v_mos uuid; v_encuentro uuid;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id into v_pv from public.punto_venta where activo and not es_respaldo and eliminado_en is null limit 1;
  select id into v_respaldo from public.punto_venta where es_respaldo and eliminado_en is null limit 1;
  select id into v_encuentro from public.terminal where es_punto_de_encuentro and eliminado_en is null;

  perform set_config('role', 'authenticated', true);

  -- ─── 1. Alta ───
  v_mos := public.crear_terminal('  Prueba Mostrador  ', 'mostrador', ' pmos9 ', v_pv);
  perform pg_temp.comprobar(
    (select nombre = 'Prueba Mostrador' and prefijo = 'PMOS9' and punto_venta_id is null and activo
       from public.terminal where id = v_mos),
    'el mostrador no quedó con el nombre limpio, el prefijo en mayúsculas y sin punto de venta');

  v_caja := public.crear_terminal('Prueba Caja', 'caja', 'PCAJA9', v_pv);
  perform pg_temp.comprobar((select punto_venta_id = v_pv from public.terminal where id = v_caja),
    'la caja no quedó con su punto de venta');
  perform pg_temp.comprobar(public.siguiente_codigo_venta(v_caja) = 'PCAJA9-000001',
    'la caja nueva no numera desde el 1 con su prefijo');

  -- ─── 2. Lo que no se puede ───
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L)', 'Prueba Caja 2', 'caja', 'PCAJA8'),
    'Una caja factura%', 'se creó una caja sin punto de venta');
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L, %L)', 'Prueba Caja 3', 'caja', 'PCAJA7', v_respaldo),
    'Ese punto de venta no sirve para una caja%', 'se creó una caja con el punto de venta de contingencia');
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L)', 'Otro', 'mostrador', 'PMOS9'),
    'El prefijo PMOS9 ya lo usa otra terminal.', 'se repitió un prefijo');
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L)', 'prueba mostrador', 'mostrador', 'PMOS8'),
    'Ya hay una terminal que se llama%', 'se repitió un nombre');
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L)', 'Con espacio', 'mostrador', 'MO S'),
    'El prefijo va sin espacios%', 'se aceptó un prefijo con espacios');
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L)', 'Rara', 'deposito', 'DEP1'),
    'El tipo tiene que ser%', 'se aceptó un tipo inventado');

  -- ─── 3. Editar: el nombre y el punto de venta; el prefijo no ───
  perform public.editar_terminal(v_mos, 'Prueba Mostrador Fondo', null);
  perform pg_temp.comprobar((select nombre = 'Prueba Mostrador Fondo' and prefijo = 'PMOS9' from public.terminal where id = v_mos),
    'editar cambió el prefijo o no cambió el nombre');
  perform pg_temp.falla(format('select public.editar_terminal(%L, %L, %L)', v_caja, 'Prueba Caja', v_respaldo),
    'Una caja necesita un punto de venta activo%', 'una caja quedó con el punto de venta de contingencia');

  -- ─── 4. Baja ───
  perform public.dar_de_baja_terminal(v_mos);
  perform pg_temp.comprobar((select not activo and eliminado_en is not null from public.terminal where id = v_mos),
    'la baja no dejó la terminal inactiva');

  if v_encuentro is not null then
    perform pg_temp.falla(format('select public.dar_de_baja_terminal(%L)', v_encuentro),
      '%es la caja que escucha a las demás%', 'se dio de baja la caja que escucha a las demás');
  end if;

  perform set_config('role', 'none', true);
  insert into public.caja (terminal_id, cajero_id, monto_inicial)
  values (v_caja, (select id from public.usuario where auth_user_id = v_admin), 0);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.falla(format('select public.dar_de_baja_terminal(%L)', v_caja),
    '%tiene la caja abierta%', 'se dio de baja una caja abierta');

  -- ─── 5. Sin permiso, nada ───
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform pg_temp.falla(format('select public.crear_terminal(%L, %L, %L)', 'Intrusa', 'mostrador', 'INTR1'),
    'No tenés permiso%', 'alguien sin permiso dio de alta una terminal');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
