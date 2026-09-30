-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LOS DATOS BANCARIOS DEL PROVEEDOR, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad, que guarda el proveedor por la
-- tabla, con las políticas de la base: igual que la pantalla.
--
-- Lo que se cuida: que un CBU con un número cambiado no se pueda
-- guardar —sería una transferencia a otra persona—, en ninguno de sus
-- dos bloques, y que el CVU de una billetera entre igual que un CBU.
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
  v_prov  uuid;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.proveedor (nombre) values ('PRUEBA DATOS BANCARIOS') returning id into v_prov;

  -- ─── 1. Un CBU y un alias bien escritos se guardan ───
  update public.proveedor set cbu = '2850590940090418135201', alias = 'MESA.SOL.CASA' where id = v_prov;
  perform pg_temp.comprobar(
    (select cbu = '2850590940090418135201' and alias = 'MESA.SOL.CASA' from public.proveedor where id = v_prov),
    'no se guardaron el CBU y el alias');

  -- ─── 2. El CVU de una billetera entra igual ───
  update public.proveedor set cbu = '0000003100010000000009' where id = v_prov;
  perform pg_temp.comprobar((select cbu = '0000003100010000000009' from public.proveedor where id = v_prov),
    'no se guardó un CVU válido');

  -- ─── 3. Un número cambiado no entra, en ninguno de los dos bloques ───
  begin
    update public.proveedor set cbu = '2850590940090418135202' where id = v_prov;
    perform pg_temp.comprobar(false, 'se guardó un CBU con la cuenta mal tipeada');
  exception when check_violation then
    perform pg_temp.comprobar(sqlerrm like '%proveedor_cbu_valido%', sqlerrm);
  end;
  begin
    update public.proveedor set cbu = '2850591940090418135201' where id = v_prov;
    perform pg_temp.comprobar(false, 'se guardó un CBU con la sucursal mal tipeada');
  exception when check_violation then
    perform pg_temp.comprobar(sqlerrm like '%proveedor_cbu_valido%', sqlerrm);
  end;
  begin
    update public.proveedor set cbu = '2850-5909-4009-0418-1352-01' where id = v_prov;
    perform pg_temp.comprobar(false, 'se guardó un CBU con guiones: la pantalla tiene que mandar sólo los dígitos');
  exception when check_violation then
    perform pg_temp.comprobar(true, '');
  end;

  -- ─── 4. El alias ───
  begin
    update public.proveedor set alias = 'mesa sol casa' where id = v_prov;
    perform pg_temp.comprobar(false, 'se guardó un alias con espacios');
  exception when check_violation then
    perform pg_temp.comprobar(sqlerrm like '%proveedor_alias_valido%', sqlerrm);
  end;

  -- ─── 5. Los dos son opcionales ───
  update public.proveedor set cbu = null, alias = null where id = v_prov;
  perform pg_temp.comprobar((select cbu is null and alias is null from public.proveedor where id = v_prov),
    'no se pudieron borrar el CBU y el alias');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
