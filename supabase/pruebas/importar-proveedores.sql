-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE IMPORTAR PROVEEDORES CON SU FICHA, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.importar(p_filas jsonb)
returns table (fila integer, codigo text, resultado text, detalle text) language sql as $$
  select * from public.importar_proveedores(p_filas)
$$;

do $$
declare
  v_admin uuid;
  r record;
  p public.proveedor;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol ro on ro.id = u.rol_id
  where ro.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1 y 2. Uno nuevo, con la ficha entera.
  select * into r from pg_temp.importar('[{"codigo":"PRUEBA-PROV-1","nombre":"PRUEBA LABORATORIO SA","nombre_fantasia":"Labo Prueba",
    "condicion_iva":"Responsable Inscripto","documento":"30-99999999-5","domicilio":"Av. Siempreviva 742","localidad":"Posadas",
    "provincia":"Misiones","telefono":"3764 000000","email":"ventas@labo.com.ar","contacto":"Carla",
    "cbu":"2850590940090418135201","alias":"LABO.PRUEBA","minimo_tipo":"kg","minimo_valor":"25","observaciones":"Entrega los martes"}]');
  perform pg_temp.comprobar(r.resultado = 'creado', format('no se creó: %s %s', r.resultado, r.detalle));
  select * into p from public.proveedor where codigo = 'PRUEBA-PROV-1' and eliminado_en is null;
  perform pg_temp.comprobar(
    p.condicion_iva_id = 1 and p.numero_documento = '30999999995' and p.tipo_documento_id = 80
    and p.cbu = '2850590940090418135201' and p.minimo_tipo = 'kilos' and p.minimo_valor = 25
    and p.contacto = 'Carla' and p.nombre_fantasia = 'Labo Prueba',
    'la ficha no quedó como decía la planilla');

  -- 3. Otra vez, con sólo el teléfono: actualiza y una celda vacía no borra.
  select * into r from pg_temp.importar('[{"codigo":"prueba-prov-1","telefono":"3764 111111","email":""}]');
  select * into p from public.proveedor where codigo = 'PRUEBA-PROV-1' and eliminado_en is null;
  perform pg_temp.comprobar(r.resultado = 'actualizado' and p.telefono = '3764 111111' and p.email = 'ventas@labo.com.ar'
    and p.nombre = 'PRUEBA LABORATORIO SA' and p.minimo_tipo = 'kilos',
    'actualizar con una fila corta borró o no cambió lo que tenía que cambiar');

  -- 4. Sin código, se reconoce por el CUIT.
  select * into r from pg_temp.importar('[{"documento":"30999999995","contacto":"Pedro"}]');
  perform pg_temp.comprobar(r.resultado = 'actualizado'
    and (select contacto from public.proveedor where codigo = 'PRUEBA-PROV-1' and eliminado_en is null) = 'Pedro'
    and (select count(*) from public.proveedor where numero_documento = '30999999995' and eliminado_en is null) = 1,
    'por el CUIT no encontró al mismo proveedor');

  -- 5. El mismo CUIT con otro código: no se funde con el primero.
  select * into r from pg_temp.importar('[{"codigo":"PRUEBA-PROV-2","nombre":"OTRO","documento":"30999999995"}]');
  perform pg_temp.comprobar(r.resultado = 'error' and r.detalle like '%ya es del proveedor PRUEBA-PROV-1%',
    format('un CUIT de otro proveedor no se frenó: %s %s', r.resultado, r.detalle));

  -- 6. Un CBU que no cierra se frena con un motivo claro.
  select * into r from pg_temp.importar('[{"codigo":"PRUEBA-PROV-3","nombre":"PRUEBA CBU","cbu":"2850590940090418135202"}]');
  perform pg_temp.comprobar(r.resultado = 'error' and r.detalle like '%CBU%', format('un CBU malo entró: %s', r.detalle));

  -- 7. Un mínimo a medias, en uno nuevo, también.
  select * into r from pg_temp.importar('[{"codigo":"PRUEBA-PROV-4","nombre":"PRUEBA MINIMO","minimo_tipo":"Monto"}]');
  perform pg_temp.comprobar(r.resultado = 'error' and r.detalle like '%mínimo de compra necesita%', format('un mínimo a medias entró: %s', r.detalle));

  -- 8. El mínimo se entiende como se escriba.
  perform pg_temp.comprobar(app.minimo_desde_texto('$') = 'monto' and app.minimo_desde_texto('Bultos') = 'bultos'
    and app.minimo_desde_texto('KG') = 'kilos' and app.minimo_desde_texto('docenas') is null,
    'el mínimo no se entiende como lo escribe una persona');

  -- 9. Sin permiso, nada.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform * from pg_temp.importar('[{"codigo":"PRUEBA-PROV-5","nombre":"INTRUSO"}]');
    perform pg_temp.comprobar(false, 'se importó sin permiso');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%No tenés permiso%', sqlerrm);
  end;

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
