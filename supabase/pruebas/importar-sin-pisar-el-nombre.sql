-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS: IMPORTAR CLIENTES SIN PISAR EL NOMBRE
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad. Lo que se cuida: que a un
-- cliente que ya está se le pueda mandar sólo un dato —el teléfono— sin
-- el nombre, y que el nombre quede; y que uno nuevo sin nombre no entre.
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
  v_r record;
  v_cliente public.cliente;
begin
  select u.auth_user_id into v_auth
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_auth is not null, 'hace falta un Administrador con cuenta');
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 2. Se crea un cliente de prueba, con nombre y teléfono.
  select * into v_r from public.importar_clientes(
    '[{"codigo":"PRUEBA-NOMBRE-1","nombre":"PRUEBA NOMBRE QUE QUEDA","telefono":"3755 111111"}]'::jsonb, null);
  perform pg_temp.comprobar(v_r.resultado = 'creado', format('al crear dio %s: %s', v_r.resultado, v_r.detalle));

  -- 3 y 4. Se le manda sólo el teléfono: se actualiza y el nombre queda.
  select * into v_r from public.importar_clientes(
    '[{"codigo":"PRUEBA-NOMBRE-1","telefono":"3755 222222"}]'::jsonb, null);
  perform pg_temp.comprobar(v_r.resultado = 'actualizado', format('sin nombre dio %s: %s', v_r.resultado, v_r.detalle));
  select * into v_cliente from public.cliente where codigo = 'PRUEBA-NOMBRE-1' and eliminado_en is null;
  perform pg_temp.comprobar(v_cliente.nombre = 'PRUEBA NOMBRE QUE QUEDA' and v_cliente.telefono = '3755 222222',
    format('quedó «%s» con teléfono %s', v_cliente.nombre, v_cliente.telefono));

  -- 5. Con nombre, el nombre se actualiza como antes.
  select * into v_r from public.importar_clientes(
    '[{"codigo":"PRUEBA-NOMBRE-1","nombre":"PRUEBA NOMBRE NUEVO"}]'::jsonb, null);
  select * into v_cliente from public.cliente where codigo = 'PRUEBA-NOMBRE-1' and eliminado_en is null;
  perform pg_temp.comprobar(v_cliente.nombre = 'PRUEBA NOMBRE NUEVO' and v_cliente.telefono = '3755 222222',
    format('con nombre quedó «%s» con teléfono %s', v_cliente.nombre, v_cliente.telefono));

  -- 6 y 7. Uno nuevo sin nombre no entra, y lo dice.
  select * into v_r from public.importar_clientes(
    '[{"codigo":"PRUEBA-NOMBRE-2","telefono":"3755 333333"}]'::jsonb, null);
  perform pg_temp.comprobar(v_r.resultado = 'error' and v_r.detalle like 'Falta el nombre%',
    format('nuevo sin nombre dio %s: %s', v_r.resultado, v_r.detalle));
  perform pg_temp.comprobar(not exists (select 1 from public.cliente where codigo = 'PRUEBA-NOMBRE-2'),
    'el cliente sin nombre quedó creado');

  -- 8 a 10. Dos clientes con distinto código y el mismo CUIT, como en
  -- OBTech: el segundo se frena y dice de quién es; el primero queda.
  select * into v_r from public.importar_clientes(
    '[{"codigo":"PRUEBA-CUIT-A","nombre":"PRUEBA FACULTAD A","documento":"30-59821809-5"},
      {"codigo":"PRUEBA-CUIT-B","nombre":"PRUEBA FACULTAD B","documento":"30598218095"}]'::jsonb, null)
    where fila = 2;
  perform pg_temp.comprobar(v_r.resultado = 'error' and v_r.detalle like '%ya es del cliente PRUEBA-CUIT-A (PRUEBA FACULTAD A)%',
    format('el CUIT repetido dio %s: %s', v_r.resultado, v_r.detalle));
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.cliente where numero_documento = '30598218095' and eliminado_en is null
       and codigo = 'PRUEBA-CUIT-A' and nombre = 'PRUEBA FACULTAD A'),
    'el primero perdió su código o su nombre');
  -- Sin código, se lo sigue reconociendo por el CUIT.
  select * into v_r from public.importar_clientes(
    '[{"nombre":"PRUEBA FACULTAD A","documento":"30598218095","telefono":"3755 444444"}]'::jsonb, null);
  perform pg_temp.comprobar(v_r.resultado = 'actualizado'
    and (select telefono = '3755 444444' from public.cliente where codigo = 'PRUEBA-CUIT-A' and eliminado_en is null),
    format('sin código y con el CUIT dio %s: %s', v_r.resultado, v_r.detalle));

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
