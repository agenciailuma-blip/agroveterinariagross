-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LAS IMÁGENES DE LOS PRODUCTOS, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- El archivo se simula con su registro en el almacenamiento, como lo deja
-- una subida: lo que se prueba es quién puede subir, que no se anote una
-- foto sin archivo, el orden y que el catálogo de la tienda las mande.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_canal    uuid := app.canal_de_la_tienda();
  v_p        uuid;
  v_admin    uuid;
  v_i1       uuid;
  v_i2       uuid;
  v_ruta     text;
  v_catalogo json;
  v_fotos    json;
  rechazado  boolean;
  i          integer;
begin
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-IMG', 'PRUEBA IMG', 'Producto con fotos', 5000) returning id into v_p;
  insert into public.canal_producto (canal_id, producto_id, publicar) values (v_canal, v_p, true);

  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
   where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'hace falta un Administrador con cuenta');

  -- 2. El depósito existe, es público y sólo acepta WebP.
  perform pg_temp.comprobar(
    (select public and allowed_mime_types = array['image/webp'] from storage.buckets where id = 'productos'),
    'el depósito de fotos no es público o acepta otra cosa que WebP');

  -- 3. Sin permiso no se sube nada al depósito.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into storage.objects (bucket_id, name) values ('productos', v_p || '/intruso.webp');
    rechazado := false;
  exception when others then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'una sesión sin permiso pudo subir una foto al depósito');

  -- 4. Con permiso, sí.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('productos', v_p || '/a.webp'), ('productos', v_p || '/b.webp');
  perform pg_temp.comprobar(true, 'un Administrador sube fotos al depósito');

  -- 5 y 6. Se anotan, en orden.
  v_i1 := public.agregar_imagen_producto(v_p, v_p || '/a.webp', 1200, 900);
  v_i2 := public.agregar_imagen_producto(v_p, v_p || '/b.webp', 800, 800);
  perform pg_temp.comprobar(v_i1 is not null and v_i2 is not null, 'no se pudieron anotar las fotos subidas');
  perform pg_temp.comprobar(
    (select array_agg(id order by orden) from public.producto_imagen where producto_id = v_p and eliminado_en is null) = array[v_i1, v_i2],
    'las fotos no quedaron en el orden en que se subieron');

  -- 7. Sin archivo no se anota: sería una foto rota en la tienda.
  begin
    perform public.agregar_imagen_producto(v_p, v_p || '/no-existe.webp', 100, 100);
    rechazado := false;
  exception when others then
    rechazado := sqlerrm like '%no llegó al almacenamiento%';
  end;
  perform pg_temp.comprobar(rechazado, 'se anotó una foto cuyo archivo no está');

  -- 8. Fuera de la carpeta del producto, tampoco.
  v_ruta := gen_random_uuid() || '/ajena.webp';
  insert into storage.objects (bucket_id, name) values ('productos', v_ruta);
  begin
    perform public.agregar_imagen_producto(v_p, v_ruta, 100, 100);
    rechazado := false;
  exception when others then
    rechazado := sqlerrm like '%carpeta del producto%';
  end;
  perform pg_temp.comprobar(rechazado, 'se anotó como foto del producto un archivo de otra carpeta');

  -- 9. Hasta ocho.
  for i in 3..8 loop
    insert into storage.objects (bucket_id, name) values ('productos', v_p || '/' || i || '.webp');
    perform public.agregar_imagen_producto(v_p, v_p || '/' || i || '.webp', 100, 100);
  end loop;
  insert into storage.objects (bucket_id, name) values ('productos', v_p || '/9.webp');
  begin
    perform public.agregar_imagen_producto(v_p, v_p || '/9.webp', 100, 100);
    rechazado := false;
  exception when others then
    rechazado := sqlerrm like '%hasta 8 fotos%';
  end;
  perform pg_temp.comprobar(rechazado, 'se pudo anotar una novena foto');

  -- 10. Ordenar: la segunda pasa a ser la principal.
  perform public.ordenar_imagenes_producto(v_p, array[v_i2, v_i1]);
  perform pg_temp.comprobar(
    (select id from public.producto_imagen where producto_id = v_p and eliminado_en is null order by orden, creado_en limit 1) = v_i2,
    'ordenar no cambió la principal');

  -- 11. Quitar devuelve la ruta, para borrar el archivo.
  perform pg_temp.comprobar(public.quitar_imagen_producto(v_i1) = v_p || '/a.webp', 'quitar no devolvió la ruta del archivo');

  -- 12. Y el archivo se borra. Para borrar, el almacenamiento tiene que
  -- poder ver el archivo: sin eso, el borrado no encontraba nada y no
  -- avisaba, y la foto quitada quedaba ocupando lugar.
  -- El almacenamiento borra con este permiso; directo, no deja.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'productos' and name = v_p || '/a.webp';
  get diagnostics i = row_count;
  perform pg_temp.comprobar(i = 1, format('el archivo de la foto quitada no se pudo borrar del depósito (borró %s)', i));

  perform set_config('role', 'postgres', true);

  -- 13 a 15. El catálogo de la tienda las manda, con su dirección, la principal primero y sin la quitada.
  v_catalogo := app.catalogo_de_canal(v_canal, null, 1000, clock_timestamp() + interval '1 second');
  select e -> 'imagenes' into v_fotos from json_array_elements(v_catalogo -> 'productos') e where e ->> 'id' = v_p::text;
  perform pg_temp.comprobar(json_array_length(v_fotos) = 7, format('el catálogo tenía que mandar 7 fotos y manda %s', json_array_length(v_fotos)));
  perform pg_temp.comprobar(
    v_fotos -> 0 ->> 'url' = 'https://ywggnhoifhtoncnxrodh.supabase.co/storage/v1/object/public/productos/' || v_p || '/b.webp',
    format('la principal del catálogo no es la que se eligió, o su dirección está mal: %s', v_fotos -> 0 ->> 'url'));
  perform pg_temp.comprobar(
    (v_fotos -> 0 ->> 'ancho')::integer = 800 and (v_fotos -> 0 ->> 'alto')::integer = 800,
    'el catálogo no manda el tamaño de la foto');

  /*
    Que agregar o quitar una foto le avise a la tienda lo hace el mismo
    disparador que ya usan los códigos de barra y las clasificaciones
    (app.tocar_producto). Adentro de una transacción no se puede probar:
    la fecha del producto y la de la foto son la misma.
  */
  perform pg_temp.comprobar(
    exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
            where t.tgrelid = 'public.producto_imagen'::regclass and f.proname = 'tocar_producto'),
    'las fotos no tienen el disparador que le avisa a la tienda');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
