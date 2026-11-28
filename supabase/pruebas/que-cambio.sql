-- Preguntar una sola vez qué cambió (28/11).
--
-- No deja nada escrito: termina siempre con un error que dice el
-- resultado («PRUEBA OK» o qué falló) y deshace todo. Se corre después
-- de la migración 20261128130000, o junto con ella en el mismo envío
-- para probarla antes de aplicarla.

do $$
declare
  v_tablas constant text[] := array[
    'producto', 'producto_codigo_barra', 'stock_saldo', 'umbral_stock', 'cliente', 'lista_precio',
    'medio_pago', 'medio_pago_cuota', 'configuracion', 'punto_venta', 'caea',
    'cuenta_corriente_saldo', 'secuencia_comprobante',
    'categoria', 'marca', 'presentacion', 'animal', 'etapa_vida'
  ];
  v_usuario record;
  v_t text;
  v_inicio jsonb := '{}';
  v_futuro jsonb := '{}';
  v_r jsonb;
  v_hay boolean;
  v_huella text;
  v_como_la_app text;
  v_venta uuid;
  v_antes timestamptz;
  v_ms numeric;
  v_desde timestamptz;
  v_hechos text := '';
begin
  foreach v_t in array v_tablas loop
    v_inicio := v_inicio || jsonb_build_object(v_t, '1970-01-01T00:00:00Z');
    v_futuro := v_futuro || jsonb_build_object(v_t, '2999-01-01T00:00:00Z');
  end loop;

  if has_function_privilege('anon', 'public.que_cambio(jsonb, text)', 'execute')
     or has_function_privilege('anon', 'public.contadores_del_menu()', 'execute') then
    raise exception 'FALLA: sin sesión se puede llamar';
  end if;
  v_hechos := v_hechos || ' sin-sesion';

  -- Un usuario de cada rol: ve exactamente lo mismo que preguntando tabla por tabla.
  for v_usuario in
    select distinct on (r.nombre) r.nombre as rol, u.auth_user_id
    from public.usuario u join public.rol r on r.id = u.rol_id
    where u.auth_user_id is not null
    order by r.nombre
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario.auth_user_id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    v_r := public.que_cambio(v_inicio, 'CAJA1');
    foreach v_t in array v_tablas loop
      execute format('select exists (select 1 from public.%I where actualizado_en > %L)', v_t, '1970-01-01T00:00:00Z')
        into v_hay;
      if v_hay <> (v_r->'cambiaron' ? v_t) then
        raise exception 'FALLA (%): % no coincide con la consulta directa', v_usuario.rol, v_t;
      end if;
    end loop;

    if (v_r->>'venta') is distinct from
       (select codigo from public.venta where codigo like 'CAJA1-%' order by codigo desc limit 1) then
      raise exception 'FALLA (%): último código de venta', v_usuario.rol;
    end if;
    foreach v_t in array array['presupuesto', 'remito', 'comprobante_interno', 'comprobante_entrega'] loop
      if coalesce((v_r->'no_fiscal'->>v_t)::bigint, 0) <> coalesce((
           select numero from public.comprobante_no_fiscal
           where tipo_clave = v_t and serie ilike 'CAJA1' order by numero desc limit 1), 0) then
        raise exception 'FALLA (%): numeración de %', v_usuario.rol, v_t;
      end if;
    end loop;

    if public.contadores_del_menu() <> jsonb_build_object(
         'pedidos', public.pedidos_web_pendientes(),
         'mayorista', public.mayorista_pedidos_pendientes(),
         'cobros', public.mayorista_ordenes_recibo_pendientes()) then
      raise exception 'FALLA (%): contadores', v_usuario.rol;
    end if;

    if jsonb_array_length(public.que_cambio(v_futuro, null)->'cambiaron') <> 0 then
      raise exception 'FALLA (%): sin novedades dice que hay', v_usuario.rol;
    end if;

    reset role;
    v_hechos := v_hechos || ' ' || replace(v_usuario.rol, ' ', '-');
  end loop;

  select auth_user_id into v_usuario.auth_user_id
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_usuario.auth_user_id, 'role', 'authenticated')::text, true);

  -- Una tabla que la función no conoce se contesta como cambiada.
  set local role authenticated;
  if not (public.que_cambio('{"tabla_nueva": "2999-01-01T00:00:00Z"}', null)->'cambiaron' ? 'tabla_nueva') then
    raise exception 'FALLA: tabla desconocida';
  end if;
  reset role;
  v_hechos := v_hechos || ' desconocida';

  -- Un cambio posterior al cursor aparece, y sólo en su tabla.
  select max(actualizado_en) into v_antes from public.producto;
  update public.producto set nombre_publico = nombre_publico
  where id = (select id from public.producto limit 1);
  set local role authenticated;
  v_r := public.que_cambio(v_futuro || jsonb_build_object('producto', v_antes), null);
  reset role;
  if v_r->'cambiaron' <> '["producto"]'::jsonb then
    raise exception 'FALLA: el cambio de un producto devolvió %', v_r->'cambiaron';
  end if;
  v_hechos := v_hechos || ' cambio';

  -- La huella está escrita como la arma la app con lo que le entrega la API.
  set local role authenticated;
  v_huella := public.que_cambio('{}', null)->>'cola';
  with cola as (
    select id, actualizado_en from public.venta where estado = 'en_caja' order by enviada_caja_en limit 200
  ), filas as (
    select json_agg(c) as j from cola c
    union all
    select json_agg(l) from (
      select id, actualizado_en from public.venta_linea where venta_id in (select id from cola)
    ) l
  )
  select coalesce(string_agg(m, ',' order by m collate "C"), '') into v_como_la_app
  from (
    select (e->>'id') || '@' || (e->>'actualizado_en') as m
    from filas, lateral json_array_elements(filas.j) e
  ) x;
  reset role;
  if v_como_la_app <> v_huella then
    raise exception 'FALLA: la huella no coincide con la que arma la app';
  end if;
  v_hechos := v_hechos || ' huella-igual';

  -- La huella de la cola cambia cuando entra una venta a esperar cobro.
  select id into v_venta from public.venta where estado <> 'en_caja' order by actualizado_en desc limit 1;
  set local role authenticated;
  v_huella := public.que_cambio('{}', null)->>'cola';
  if public.que_cambio('{}', null)->>'cola' <> v_huella then
    raise exception 'FALLA: la huella no es estable';
  end if;
  reset role;
  update public.venta set estado = 'en_caja', enviada_caja_en = now() where id = v_venta;
  set local role authenticated;
  if public.que_cambio('{}', null)->>'cola' = v_huella then
    raise exception 'FALLA: la huella no cambió con una venta nueva en la cola';
  end if;

  -- Cuánto tarda la vuelta sin novedades.
  v_desde := clock_timestamp();
  perform public.que_cambio(v_futuro, 'CAJA1');
  v_ms := round(extract(epoch from clock_timestamp() - v_desde) * 1000);
  reset role;
  v_hechos := v_hechos || ' cola';

  raise exception 'PRUEBA OK:% · sin novedades tarda % ms (nada queda escrito)', v_hechos, v_ms;
end;
$$;
