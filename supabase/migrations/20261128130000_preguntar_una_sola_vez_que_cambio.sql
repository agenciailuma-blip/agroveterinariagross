/*
  ─────────────────────────────────────────────────────────────
  Preguntar una sola vez qué cambió

  Cada PC hacía unas 38 consultas por minuto aunque no hubiera cambiado
  nada: una por tabla de la sincronización, la numeración y los avisos
  del menú. Con eso se pasaron los cupos de registros y de transferencia
  (28/11).

  que_cambio contesta de una vez qué tablas tienen novedades —y la PC
  baja sólo ésas, con las mismas consultas de siempre—, una huella de la
  cola de la caja, la generación de la copia local y hasta dónde llegó la
  numeración de la terminal. contadores_del_menu junta los tres contadores.

  Las dos son nuevas: las PC con la versión anterior siguen igual.
  ─────────────────────────────────────────────────────────────
*/

/*
  security invoker a propósito: cada PC ve lo mismo que veía preguntando
  tabla por tabla, ni una fila más.

  Una tabla que la función no conoce se contesta como cambiada: si una
  versión nueva sincroniza algo más y acá se olvida, se baja igual.
*/
create or replace function public.que_cambio(p_cursores jsonb, p_prefijo text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_conocidas constant text[] := array[
    'producto', 'producto_codigo_barra', 'stock_saldo', 'umbral_stock', 'cliente', 'lista_precio',
    'medio_pago', 'medio_pago_cuota', 'configuracion', 'punto_venta', 'caea',
    'cuenta_corriente_saldo', 'secuencia_comprobante',
    'categoria', 'marca', 'presentacion', 'animal', 'etapa_vida'
  ];
  v_tabla text;
  v_desde text;
  v_hay boolean;
  v_cambiaron text[] := '{}';
  v_generacion text;
  v_cola text;
  v_venta text;
  v_no_fiscal jsonb := '{}';
begin
  for v_tabla, v_desde in select c.key, c.value from jsonb_each_text(coalesce(p_cursores, '{}')) c
  loop
    if v_tabla = any (v_conocidas) and v_desde is not null then
      execute format('select exists (select 1 from public.%I where actualizado_en > $1)', v_tabla)
        into v_hay
        using v_desde::timestamptz;
    else
      v_hay := true;
    end if;
    if v_hay then
      v_cambiaron := v_cambiaron || v_tabla;
    end if;
  end loop;

  select c.valor #>> '{}' into v_generacion
  from public.configuracion c
  where c.clave = 'copia_local.generacion';

  -- La misma cola que baja la caja: las ventas que esperan cobro y sus renglones.
  with cola as (
    select v.id, v.actualizado_en
    from public.venta v
    where v.estado = 'en_caja'
    order by v.enviada_caja_en
    limit 200
  )
  /*
    En texto y no resumida: la PC arma la misma con lo que bajó, y sólo si
    coinciden da la cola por vista. La fecha va escrita como la entrega la
    API (to_jsonb), y el orden es por código de carácter, como en la app.
  */
  select coalesce(string_agg(x.marca, ',' order by x.marca collate "C"), '')
    into v_cola
  from (
    select c.id::text || '@' || (to_jsonb(c.actualizado_en) #>> '{}') as marca from cola c
    union all
    select l.id::text || '@' || (to_jsonb(l.actualizado_en) #>> '{}')
    from public.venta_linea l
    where l.venta_id in (select c.id from cola c)
  ) x;

  if nullif(p_prefijo, '') is not null then
    select v.codigo into v_venta
    from public.venta v
    where v.codigo like p_prefijo || '-%'
    order by v.codigo desc
    limit 1;

    select coalesce(jsonb_object_agg(n.tipo_clave, n.maximo), '{}')
      into v_no_fiscal
    from (
      select f.tipo_clave, max(f.numero) as maximo
      from public.comprobante_no_fiscal f
      where f.tipo_clave in ('presupuesto', 'remito', 'comprobante_interno', 'comprobante_entrega')
        and f.serie ilike p_prefijo
      group by f.tipo_clave
    ) n;
  end if;

  return jsonb_build_object(
    'cambiaron', to_jsonb(v_cambiaron),
    'generacion', coalesce(v_generacion, '0'),
    'cola', v_cola,
    'venta', v_venta,
    'no_fiscal', v_no_fiscal
  );
end;
$$;

comment on function public.que_cambio(jsonb, text) is
  'Qué tiene que bajar una PC: las tablas con cambios desde sus cursores, la huella de la cola de la caja, la generación de la copia local y la última numeración de su terminal.';

revoke all on function public.que_cambio(jsonb, text) from public, anon;
grant execute on function public.que_cambio(jsonb, text) to authenticated;

-- Cada contador sigue mirando su permiso: acá sólo se juntan.
create or replace function public.contadores_del_menu()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'pedidos', public.pedidos_web_pendientes(),
    'mayorista', public.mayorista_pedidos_pendientes(),
    'cobros', public.mayorista_ordenes_recibo_pendientes()
  );
$$;

comment on function public.contadores_del_menu() is
  'Los contadores del menú en una sola consulta; cada uno vale 0 para quien no tiene su permiso.';

revoke all on function public.contadores_del_menu() from public, anon;
grant execute on function public.contadores_del_menu() to authenticated;
