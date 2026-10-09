-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LOS AVISOS DE STOCK Y DEL HISTORIAL DE MOVIMIENTOS,
-- CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad y como alguien sin cuenta.
--
-- Lo que se cuida: los tres niveles —gana el más específico—, que quitar
-- un aviso no lo borre (si no, las PC no se enteran), que el general lo
-- pueda cambiar quien configura avisos, y que el historial dé el saldo
-- después de cada movimiento en el orden en que pasaron.
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
exception when others then
  perform pg_temp.comprobar(sqlerrm like p_mensaje, p_que || ' — dijo: ' || sqlerrm);
end $$;

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.aviso(p_producto uuid)
returns text language sql as $$
  select trim_scale(umbral_bajo)::text || '/' || trim_scale(umbral_critico)::text from public.vista_stock where producto_id = p_producto
$$;

do $$
declare
  v_admin    uuid;
  v_usuario  uuid;
  v_otro     uuid;
  v_caja     uuid;
  v_cat      uuid;
  v_a        uuid;
  v_b        uuid;
  v_m        uuid;
begin
  select u.auth_user_id, u.id into v_admin, v_usuario
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  select id into v_otro from public.usuario where id <> v_usuario and eliminado_en is null limit 1;
  select id into v_caja from public.terminal where tipo = 'caja' and eliminado_en is null limit 1;
  perform pg_temp.como(v_admin);

  -- ─── Datos de prueba ───
  insert into public.categoria (nombre, slug) values ('PRUEBA Avisos', 'prueba-avisos') returning id into v_cat;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, categoria_id)
    values ('PRUEBA-AV-A', 'PRUEBA AVISO A', 100, 5, v_cat) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, categoria_id)
    values ('PRUEBA-AV-B', 'PRUEBA AVISO B', 100, 5, v_cat) returning id into v_b;

  perform set_config('role', 'authenticated', true);

  -- ─── 1. El general ───
  perform public.definir_umbral_general(8, 2);
  perform pg_temp.comprobar(pg_temp.aviso(v_a) = '8/2', 'el aviso general nuevo no rige para un producto sin otro: ' || pg_temp.aviso(v_a));
  perform pg_temp.falla('select public.definir_umbral_general(2, 3)',
    'El nivel crítico tiene que ser menor o igual que el nivel bajo.', 'se aceptó un crítico mayor que el bajo');
  perform pg_temp.falla('select public.definir_umbral_general(-1, 0)',
    'El aviso general necesita los dos números, y no pueden ser negativos.', 'se aceptó un aviso negativo');

  -- ─── 2. La categoría le gana al general ───
  perform public.definir_umbral_categoria(v_cat, 4, 1);
  perform pg_temp.comprobar(pg_temp.aviso(v_a) = '4/1' and pg_temp.aviso(v_b) = '4/1',
    'el aviso de la categoría no rige para sus productos');
  perform pg_temp.comprobar(
    (select productos = 2 and bajo = 4 and critico = 1 from public.avisos_por_categoria() where categoria_id = v_cat),
    'la lista por categoría no dice cuántos productos tiene y su aviso');

  -- ─── 3. El producto le gana a la categoría ───
  perform public.definir_umbral_producto(v_a, 6, 3);
  perform pg_temp.comprobar(pg_temp.aviso(v_a) = '6/3' and pg_temp.aviso(v_b) = '4/1',
    'el aviso propio no le ganó al de la categoría, o se le aplicó a otro');

  -- ─── 4. Quitar no borra: la baja tiene que viajar a las PC ───
  perform public.definir_umbral_categoria(v_cat, null, null);
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(eliminado_en is not null) from public.umbral_stock where categoria_id = v_cat),
    'quitar el aviso de la categoría lo borró: las PC no se enterarían');
  -- La fecha la mueve el disparador de siempre. Adentro de una sola
  -- transacción now() no cambia, así que se controla que esté.
  perform pg_temp.comprobar(exists (
      select 1 from pg_trigger
       where tgrelid = 'public.umbral_stock'::regclass and tgname = 'umbral_stock_actualizado_en' and tgenabled <> 'D'),
    'falta el disparador que le mueve la fecha al aviso: quitarlo no viajaría a las PC');
  perform pg_temp.comprobar(pg_temp.aviso(v_b) = '8/2' and pg_temp.aviso(v_a) = '6/3',
    'con el aviso de la categoría quitado, sus productos no volvieron al general');
  perform pg_temp.comprobar(
    (select bajo is null from public.avisos_por_categoria() where categoria_id = v_cat),
    'la lista por categoría sigue mostrando un aviso quitado');

  -- Volver a ponerlo revive la misma fila.
  perform public.definir_umbral_categoria(v_cat, 5, 2);
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(eliminado_en is null) from public.umbral_stock where categoria_id = v_cat),
    'volver a poner el aviso de la categoría no revivió la fila');
  perform pg_temp.comprobar(pg_temp.aviso(v_b) = '5/2', 'el aviso de la categoría puesto de nuevo no rige');

  perform public.definir_umbral_producto(v_a, null, null);
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(eliminado_en is not null) from public.umbral_stock where producto_id = v_a),
    'quitar el aviso del producto lo borró');
  perform pg_temp.comprobar(pg_temp.aviso(v_a) = '5/2', 'sin aviso propio, el producto no volvió al de su categoría');
  perform public.definir_umbral_producto(v_a, 7, 0);
  perform pg_temp.comprobar(
    (select count(*) = 1 and bool_and(eliminado_en is null) from public.umbral_stock where producto_id = v_a)
    and pg_temp.aviso(v_a) = '7/0',
    'volver a poner el aviso del producto no revivió la fila');

  -- ─── 5. El historial de movimientos ───
  reset role;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo, usuario_id, ocurrido_en)
    values (v_b, 'carga_inicial', 10, 'Carga inicial de inventario', 'manual', v_usuario, now() - interval '3 hours');
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
                                       usuario_id, operador_id, terminal_id, ocurrido_en)
    values (v_b, 'venta', -3, 'Venta PRUEBA-AV-1', 'venta', gen_random_uuid(), v_usuario, v_otro, v_caja,
            now() - interval '1 hour')
    returning id into v_m;
  -- Llega último pero pasó antes: una venta hecha sin internet.
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
                                       usuario_id, ocurrido_en, registrado_offline)
    values (v_b, 'venta', -2, 'Venta PRUEBA-AV-2', 'venta', gen_random_uuid(), v_usuario,
            now() - interval '2 hours', true);
  perform set_config('role', 'authenticated', true);

  perform pg_temp.comprobar(
    (select array_agg(motivo order by ocurrido_en desc) = array['Venta PRUEBA-AV-1', 'Venta PRUEBA-AV-2', 'Carga inicial de inventario']
       from public.movimientos_de_producto(v_b)),
    'el historial no va del más nuevo al más viejo según cuándo pasó');
  perform pg_temp.comprobar(
    (select array_agg(saldo order by ocurrido_en desc) = array[5, 8, 10]::numeric[]
       from public.movimientos_de_producto(v_b)),
    'el saldo después de cada movimiento no es el del libro sumado en orden');
  perform pg_temp.comprobar(
    (select usuario is not null and vendedor is not null and terminal is not null and deposito is not null
       from public.movimientos_de_producto(v_b) where id = v_m),
    'la venta no dice quién la cobró, quién la vendió, en qué máquina y en qué depósito');
  perform pg_temp.comprobar(
    (select vendedor is null and registrado_offline from public.movimientos_de_producto(v_b) where motivo = 'Venta PRUEBA-AV-2'),
    'el historial nombra un vendedor cuando es el mismo que registró, o no dice que se hizo sin internet');
  perform pg_temp.comprobar(
    (select count(*) = 2 and min(total) = 3 from public.movimientos_de_producto(v_b, null, 2)),
    'con límite no trae los últimos y cuántos hay en total');
  perform pg_temp.comprobar(
    (select saldo = (select cantidad from public.stock_saldo where producto_id = v_b)
       from public.movimientos_de_producto(v_b) limit 1),
    'el último saldo del historial no es el stock del producto');
  perform pg_temp.comprobar(
    (select count(*) = 3 from public.movimientos_de_producto(v_b, app.deposito_principal())),
    'el historial del depósito principal no trae lo que pasó ahí');

  -- ─── 5b. Abrir la caja va antes que la venta que la provocó ───
  -- Pasan en el mismo instante y en la misma transacción. Los ids están
  -- elegidos para que, desempatando por id, la venta saliera primero y
  -- dijera «queda −1».
  reset role;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id)
    values ('PRUEBA-AV-C', 'PRUEBA AVISO C', 100, 5) returning id into v_a;
  insert into public.movimiento_stock (id, producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, ocurrido_en)
    values ('00000000-0000-4000-8000-000000000001', v_a, 'venta', -1, 'Venta PRUEBA-AV-3', 'venta', gen_random_uuid(),
            now() - interval '30 minutes'),
           ('ffffffff-ffff-4fff-bfff-ffffffffffff', v_a, 'fraccionamiento', 10, 'Sale de abrir 1 PRUEBA CAJA', 'fraccionamiento',
            gen_random_uuid(), now() - interval '30 minutes');
  perform set_config('role', 'authenticated', true);
  perform pg_temp.comprobar(
    (select array_agg(saldo order by r) = array[9, 10]::numeric[]
       from (select saldo, row_number() over () as r from public.movimientos_de_producto(v_a)) x),
    'a la misma hora, la venta quedó antes que la apertura de la caja: el historial dice «queda −1»');

  -- ─── 6. Sin cuenta, nada ───
  perform pg_temp.como(gen_random_uuid());
  perform pg_temp.falla('select public.definir_umbral_general(9, 1)',
    'No tenés permiso para cambiar los avisos de stock.', 'alguien sin permiso cambió el aviso general');
  perform pg_temp.falla(format('select public.definir_umbral_categoria(%L, 9, 1)', gen_random_uuid()),
    '%row-level security%', 'alguien sin permiso puso el aviso de una categoría');
  perform pg_temp.falla(format('select * from public.movimientos_de_producto(%L)', v_b),
    'No tenés permiso para ver el stock.', 'alguien sin permiso vio el historial');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
