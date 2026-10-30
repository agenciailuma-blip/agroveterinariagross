-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA FECHA DE LA FACTURA, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que hizo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Copia un comprobante que ya existe para no inventar sus datos, con
-- números muy altos, y le pasa a la función un último de ARCA igual de
-- alto: no se pisa con nada real.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Una copia del modelo, en la serie pedida, con el estado y la fecha pedidos.
create function pg_temp.copia(p_modelo uuid, p_tipo smallint, p_numero bigint, p_estado text, p_fecha date, p_cae text)
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.comprobante
  select (jsonb_populate_record(null::public.comprobante, to_jsonb(c) || jsonb_build_object(
    'id', v_id, 'tipo_comprobante_id', p_tipo, 'numero', p_numero, 'venta_id', null,
    'estado', p_estado, 'modalidad', 'cae', 'fecha', p_fecha, 'cae', p_cae,
    'autorizado_en', case when p_cae is null then null else now() end))).*
  from public.comprobante c where c.id = p_modelo;
  return v_id;
end $$;

do $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  modelo uuid;
  pv uuid;
  serie smallint;
  libre smallint;
  base bigint := 900000000;
  c uuid;
  r record;
begin
  select m.id, m.punto_venta_id, m.tipo_comprobante_id into modelo, pv, serie
  from public.comprobante m where m.cae is not null order by m.creado_en desc limit 1;

  -- Un tipo de esa misma punto de venta sin nada autorizado desde ayer:
  -- ahí la fecha de ayer no tiene por qué moverse.
  select t.id into libre from public.tipo_comprobante t
  where t.id <> serie
    and not exists (select 1 from public.comprobante k
      where k.punto_venta_id = pv and k.tipo_comprobante_id = t.id
        and k.cae is not null and k.fecha >= hoy - 1)
  order by t.id limit 1;
  perform pg_temp.comprobar(modelo is not null and libre is not null,
    'hace falta un comprobante autorizado y un tipo sin movimiento reciente');

  -- La serie llega hasta hoy: otra venta de hoy ya se autorizó.
  perform pg_temp.copia(modelo, serie, base, 'autorizado', hoy, 'PRUEBA');

  -- 1. El caso del 30/10: el pedido de ayer se factura después.
  c := pg_temp.copia(modelo, serie, base + 1, 'rechazado', hoy - 1, null);
  select * into r from public.alinear_numeracion_comprobante(c, base);
  perform pg_temp.comprobar(r.fecha = hoy, 'la factura de ayer se adelanta a la última de la serie');
  perform pg_temp.comprobar(r.se_corrigio_fecha, 'avisa que corrigió la fecha');
  perform pg_temp.comprobar((select k.fecha from public.comprobante k where k.id = c) = hoy,
    'la fecha corregida queda guardada');

  -- 2. Reintentar la misma no la mueve más.
  select * into r from public.alinear_numeracion_comprobante(c, base);
  perform pg_temp.comprobar(r.fecha = hoy and not r.se_corrigio_fecha, 'el reintento no cambia nada');
  delete from public.comprobante k where k.id = c;

  -- 3. Con la misma fecha que la última, no se toca.
  c := pg_temp.copia(modelo, serie, base + 2, 'rechazado', hoy, null);
  select * into r from public.alinear_numeracion_comprobante(c, base);
  perform pg_temp.comprobar(r.fecha = hoy and not r.se_corrigio_fecha, 'la misma fecha que la última no se toca');
  delete from public.comprobante k where k.id = c;

  -- 4. Otra serie no cuenta: hoy se autorizó una B, y una A de ayer sigue siendo de ayer.
  c := pg_temp.copia(modelo, libre, base + 3, 'rechazado', hoy - 1, null);
  select * into r from public.alinear_numeracion_comprobante(c, base + 2);
  perform pg_temp.comprobar(r.fecha = hoy - 1 and not r.se_corrigio_fecha, 'otra serie no adelanta la fecha');

  -- 5. Lo rechazado no cuenta: ARCA nunca lo vio.
  perform pg_temp.copia(modelo, libre, base + 10, 'rechazado', hoy + 2, null);
  select * into r from public.alinear_numeracion_comprobante(c, base + 2);
  perform pg_temp.comprobar(r.fecha = hoy - 1, 'un rechazado con fecha posterior no adelanta la fecha');

  -- 6. Lo autorizado después, en esa serie, sí.
  perform pg_temp.copia(modelo, libre, base + 11, 'autorizado', hoy, 'PRUEBA2');
  select * into r from public.alinear_numeracion_comprobante(c, base + 2);
  perform pg_temp.comprobar(r.fecha = hoy, 'lo autorizado en la serie adelanta la fecha');
  delete from public.comprobante k where k.id = c;

  -- 7. Lo que ya andaba: pasada la tolerancia, va con la fecha de hoy.
  c := pg_temp.copia(modelo, serie, base + 4, 'rechazado', hoy - 60, null);
  select * into r from public.alinear_numeracion_comprobante(c, base);
  perform pg_temp.comprobar(r.fecha = hoy, 'una factura vieja sale con la fecha de hoy');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
