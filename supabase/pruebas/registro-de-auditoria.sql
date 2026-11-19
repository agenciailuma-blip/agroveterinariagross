-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL REGISTRO DE AUDITORÍA, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Va con 20261119120000_rastro_de_fichas_y_configuracion.sql y
-- 20261119120100_registro_de_auditoria.sql. Toca un cliente, un producto,
-- una clave de configuración y un permiso reales, y lo deshace al final.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_admin_auth uuid;
  v_admin      uuid;
  v_vend_auth  uuid;
  v_cliente    uuid;
  v_producto   uuid;
  v_terminal   uuid;
  v_rol_vend   uuid;
  v_n          integer;
  a            record;
  rechazado    boolean;
  r_borrar     boolean;
  r_corregir   boolean;
  r_vaciar     boolean;
begin
  select u.auth_user_id, u.id into v_admin_auth, v_admin from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  select u.auth_user_id into v_vend_auth from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Vendedor' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  select id into v_cliente from public.cliente where eliminado_en is null and cuenta_corriente limit 1;
  select id into v_producto from public.producto where eliminado_en is null limit 1;
  select id into v_terminal from public.terminal where activo and eliminado_en is null limit 1;
  select id into v_rol_vend from public.rol where nombre = 'Vendedor';
  perform pg_temp.comprobar(v_admin_auth is not null and v_cliente is not null and v_producto is not null,
    'hace falta un administrador con cuenta, un cliente de cuenta corriente y un producto');

  -- Como el administrador, desde un puesto.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth)::text, true);
  perform set_config('request.headers', json_build_object('x-gross-terminal', v_terminal)::text, true);

  -- 1. Un cambio en la ficha del cliente: sólo lo que cambió.
  update public.cliente set limite_credito = coalesce(limite_credito, 0) + 12345 where id = v_cliente;
  select * into a from public.auditoria where tabla = 'cliente' and registro_id = v_cliente order by creado_en desc limit 1;
  perform pg_temp.comprobar(a.id is not null, 'el cambio en el cliente queda anotado');
  perform pg_temp.comprobar(a.accion = 'update' and a.usuario_id = v_admin, 'con quién y qué');
  perform pg_temp.comprobar(a.terminal_id = v_terminal, 'con el puesto del encabezado');
  perform pg_temp.comprobar((select array_agg(k) from jsonb_object_keys(a.datos_despues) k) = array['limite_credito'],
    'sólo la columna que cambió');
  perform pg_temp.comprobar((a.datos_despues->>'limite_credito')::numeric - coalesce((a.datos_antes->>'limite_credito')::numeric, 0) = 12345,
    'con el valor de antes y el de después');
  perform pg_temp.comprobar(a.contexto->>'nombre' is not null, 'con el nombre del cliente');

  -- 2. Un encabezado basura no rompe nada: el puesto queda vacío.
  perform set_config('request.headers', '{"x-gross-terminal":"no-es-un-puesto"}', true);
  update public.cliente set limite_credito = limite_credito + 1 where id = v_cliente;
  select * into a from public.auditoria where tabla = 'cliente' and registro_id = v_cliente order by creado_en desc, id limit 1;
  perform pg_temp.comprobar(
    (select count(*) from public.auditoria where tabla = 'cliente' and registro_id = v_cliente and terminal_id is null) >= 1,
    'un puesto inválido queda vacío');
  perform set_config('request.headers', json_build_object('x-gross-terminal', v_terminal)::text, true);

  -- 3. Lo que es sólo de servicio no anota nada.
  select count(*) into v_n from public.auditoria;
  update public.producto set actualizado_en = now() - interval '1 second' where id = v_producto;
  perform public.informar_estado_pc(v_terminal, '9.9.9', '{"programa":"escritorio"}');
  perform pg_temp.comprobar((select count(*) from public.auditoria) = v_n, 'fechas y estado de la PC no anotan nada');

  -- 4. Un precio en la ficha del producto: tipo «precio».
  update public.producto set precio_venta = precio_venta + 1 where id = v_producto;
  perform pg_temp.comprobar(exists (
    select 1 from public.registro_de_auditoria(now() - interval '1 minute', null, null, 'precio', null, 50) r
     where r.referencia = 'producto' and r.referencia_id = v_producto), 'el precio de la ficha sale como precio');

  -- 5. La clave secreta de la configuración no se copia.
  insert into public.configuracion (clave, valor, descripcion, grupo)
  values ('prueba.clave_secreta', '"abc123"', 'Prueba', 'prueba');
  update public.configuracion set valor = '"xyz789"' where clave = 'prueba.clave_secreta';
  select * into a from public.auditoria where tabla = 'configuracion' and contexto->>'clave' = 'prueba.clave_secreta' and accion = 'update';
  perform pg_temp.comprobar(a.datos_antes->>'valor' = 'oculto' and a.datos_despues->>'valor' = 'oculto', 'la clave secreta queda oculta');
  perform pg_temp.comprobar(a.registro_id is null, 'la configuración no tiene id: va la clave');

  -- 6. Dar y quitar un permiso: dos renglones, con el rol y el permiso.
  delete from public.rol_permiso where rol_id = v_rol_vend and permiso_clave = 'auditoria.ver';
  insert into public.rol_permiso (rol_id, permiso_clave) values (v_rol_vend, 'auditoria.ver');
  delete from public.rol_permiso where rol_id = v_rol_vend and permiso_clave = 'auditoria.ver';
  perform pg_temp.comprobar(
    (select count(*) from public.auditoria where tabla = 'rol_permiso' and registro_id = v_rol_vend and contexto->>'permiso_clave' = 'auditoria.ver') = 2,
    'dar y quitar un permiso queda anotado');
  perform pg_temp.comprobar(exists (
    select 1 from public.registro_de_auditoria(now() - interval '1 minute', null, null, 'permisos', null, 50) r
     where r.que = 'Permiso dado' and r.detalle like 'Vendedor: %'), 'en la lista: «Permiso dado», con el rol');

  -- 7. Un aumento masivo no repite cada producto.
  insert into public.aumento_precio (porcentaje, alcance, productos, motivo, aplicado_por)
  values (5, 'precio', 1, 'prueba', v_admin);
  -- (El cambio de precio del paso 4 comparte el momento de esta transacción con el aumento.)
  perform pg_temp.comprobar(not exists (
    select 1 from public.registro_de_auditoria(now() - interval '1 minute', null, null, 'precio', null, 50) r
     where r.referencia = 'producto'), 'el producto del aumento no se repite');
  perform pg_temp.comprobar(exists (
    select 1 from public.registro_de_auditoria(now() - interval '1 minute', null, null, 'precio', null, 50) r
     where r.que = 'Aumento de precios'), 'el aumento sale una vez');

  -- 8. Filtros: persona y texto.
  perform pg_temp.comprobar(exists (
    select 1 from public.registro_de_auditoria(null, null, v_admin, null, 'limite_credito', 50)), 'busca por texto y persona');
  perform pg_temp.comprobar(not exists (
    select 1 from public.registro_de_auditoria(null, null, gen_random_uuid(), null, null, 50)), 'otra persona no ve lo de esta');

  -- 9. El Encargado ya no lo ve; el Vendedor tampoco.
  perform pg_temp.comprobar(not exists (
    select 1 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
     where r.nombre = 'Encargado' and rp.permiso_clave = 'auditoria.ver'), 'arranca sólo en el Administrador');
  if v_vend_auth is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_vend_auth)::text, true);
    begin
      perform public.registro_de_auditoria();
      rechazado := false;
    exception when others then rechazado := true;
    end;
    perform pg_temp.comprobar(rechazado, 'sin permiso no se ve la lista');
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth)::text, true);
  end if;

  -- 10. Nadie lo corrige ni lo borra desde afuera. Las comprobaciones
  -- van después de volver al rol de la prueba: la función temporal no es
  -- del rol authenticated.
  perform set_config('role', 'authenticated', true);
  begin delete from public.auditoria; r_borrar := false; exception when others then r_borrar := true; end;
  begin update public.auditoria set accion = 'update'; r_corregir := false; exception when others then r_corregir := true; end;
  begin truncate public.auditoria; r_vaciar := false; exception when others then r_vaciar := true; end;
  perform set_config('role', 'none', true);
  perform pg_temp.comprobar(r_borrar, 'no se puede borrar');
  perform pg_temp.comprobar(r_corregir, 'no se puede corregir');
  perform pg_temp.comprobar(r_vaciar, 'no se puede vaciar');

  -- 11. La lista anda entera, sin filtros.
  perform pg_temp.comprobar((select count(*) from public.registro_de_auditoria(null, null, null, null, null, 5000)) > 0,
    'la lista entera responde');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
