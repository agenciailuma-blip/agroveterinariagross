-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL HISTORIAL DE COSTOS, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad, y al final como alguien sin
-- permisos.
--
-- Lo que se cuida: que el historial compare costos con IVA —una A y una
-- B del mismo producto no pueden dar un 21% de diferencia que no
-- existe—, que cada compra se compare contra la anterior al mismo
-- proveedor, que «otro más barato» sea de verdad más barato, y que una
-- factura dada de baja no cuente.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

-- Una factura con un producto: en la A el costo del papel es sin IVA, en la B con IVA.
create function pg_temp.compra(p_prov uuid, p_tipo smallint, p_numero bigint, p_fecha date,
                               p_producto uuid, p_cantidad numeric, p_costo numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  v := public.registrar_compra(p_prov, p_tipo, 8, p_numero, p_fecha, 0, 0, null,
    jsonb_build_array(jsonb_build_object('alicuota_iva_id', 5, 'base_imponible', 1000, 'importe', 210)));
  perform public.recibir_mercaderia(v, jsonb_build_array(
    jsonb_build_object('producto_id', p_producto, 'cantidad', p_cantidad, 'costo_unitario', p_costo)));
  return v;
end $$;

do $$
declare
  v_admin uuid;
  v_uno   uuid;
  v_dos   uuid;
  v_x     uuid;
  v_baja  uuid;
  v_h     public.vista_historial_costo[];
  v_r     public.vista_costo_por_proveedor;
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  insert into public.proveedor (nombre) values ('PRUEBA COSTOS UNO') returning id into v_uno;
  insert into public.proveedor (nombre) values ('PRUEBA COSTOS DOS') returning id into v_dos;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id)
    values ('PRUEBA-COSTOS-X', 'PRUEBA COSTOS X', 2000, 5) returning id into v_x;

  perform set_config('role', 'authenticated', true);

  -- Al UNO, factura A a $1.000 sin IVA: cuesta $1.210.
  perform pg_temp.compra(v_uno, 1::smallint, 1, v_hoy - 30, v_x, 10, 1000);
  -- Al DOS, factura B a $1.300 con IVA: cuesta $1.300.
  perform pg_temp.compra(v_dos, 6::smallint, 1, v_hoy - 20, v_x, 5, 1300);
  -- Al UNO otra vez, factura A a $1.100 sin IVA: cuesta $1.331, un 10% más que su anterior.
  perform pg_temp.compra(v_uno, 1::smallint, 2, v_hoy - 10, v_x, 10, 1100);
  -- Y una que se dio de baja, carísima: no tiene que contar.
  v_baja := pg_temp.compra(v_uno, 6::smallint, 3, v_hoy - 5, v_x, 1, 5000);
  perform public.anular_compra(v_baja, 'Prueba');

  select array_agg(h order by h.fecha) into v_h from public.vista_historial_costo h where h.producto_id = v_x;

  -- ─── 1. El historial, en orden y con IVA ───
  perform pg_temp.comprobar(array_length(v_h, 1) = 3,
    'el historial no tiene las tres compras vigentes (la dada de baja no cuenta): tiene ' || array_length(v_h, 1));
  perform pg_temp.comprobar(v_h[1].costo = 1210 and v_h[1].costo_previo is null and v_h[1].proveedor = 'PRUEBA COSTOS UNO',
    'la primera compra no quedó con el costo con IVA, o dice que tiene una anterior');
  perform pg_temp.comprobar(v_h[2].costo = 1300 and v_h[2].costo_previo = 1210 and v_h[2].proveedor_previo = 'PRUEBA COSTOS UNO',
    'la compra de la B no se compara contra la anterior con IVA, o no dice de quién era');
  perform pg_temp.comprobar(v_h[3].costo = 1331 and v_h[3].costo_previo = 1300 and v_h[3].costo_previo_proveedor = 1210,
    'la tercera compra no se compara contra la anterior y contra la anterior al mismo proveedor');
  perform pg_temp.comprobar(v_h[3].factura = 'Factura A 0008-00000002',
    'el historial no dice de qué factura salió cada costo: ' || v_h[3].factura);

  -- ─── 2. El reporte por proveedor ───
  select * into v_r from public.vista_costo_por_proveedor where proveedor_id = v_uno and producto_id = v_x;
  perform pg_temp.comprobar(v_r.ultimo_costo = 1331 and v_r.costo_anterior = 1210 and v_r.variacion = 10 and v_r.compras = 2,
    'el reporte del UNO no dice que el último costo subió un 10% contra su anterior: '
      || coalesce(v_r.variacion::text, 'sin variación'));
  perform pg_temp.comprobar(v_r.otro_costo = 1300 and v_r.otro_proveedor = 'PRUEBA COSTOS DOS',
    'el reporte no avisa que el DOS lo vendió más barato');

  select * into v_r from public.vista_costo_por_proveedor where proveedor_id = v_dos and producto_id = v_x;
  perform pg_temp.comprobar(v_r.ultimo_costo = 1300 and v_r.costo_anterior is null and v_r.variacion is null,
    'una sola compra al DOS figura con una variación que no existe');
  perform pg_temp.comprobar(v_r.otro_costo is null,
    'para el DOS, el UNO figura como más barato y es más caro');

  -- ─── 3. Sin permiso no se ve ───
  perform pg_temp.como(gen_random_uuid());
  perform pg_temp.comprobar(not exists (select 1 from public.vista_historial_costo where producto_id = v_x),
    'alguien sin permiso ve el historial de costos');
  perform pg_temp.comprobar(not exists (select 1 from public.vista_costo_por_proveedor where producto_id = v_x),
    'alguien sin permiso ve el reporte de costos');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
