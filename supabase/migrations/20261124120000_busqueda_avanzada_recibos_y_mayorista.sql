-- ═══════════════════════════════════════════════════════════════
-- BÚSQUEDA AVANZADA EN RECIBOS Y EN LOS PEDIDOS DEL MAYORISTA
--
-- Lo que quedó pendiente de la 0.26.0: el mismo panel de filtros que
-- ya tienen Remitos, Facturación y Compras. Los dos listados traen sólo
-- las últimas filas (300 recibos; los facturados y cancelados del
-- mayorista, 60 días), así que el filtro tiene que ir a la base: si no,
-- un recibo o un pedido viejo no aparece nunca.
--
-- Las dos funciones suman parámetros con valor por defecto. Las PC con
-- una versión anterior las siguen llamando como antes y reciben lo
-- mismo de siempre.
--
-- El número se lee igual que en el resto del sistema: el último grupo
-- de dígitos es el número, y el anterior, si hay, la serie o el punto
-- de venta. «12», «00000012», «1-12» y «0001-00000012» encuentran el
-- mismo recibo.
-- ═══════════════════════════════════════════════════════════════

-- El número y la serie de lo que se escribió.
create or replace function app.numero_buscado(p_texto text, out numero bigint, out serie integer)
language sql immutable
set search_path to ''
as $$
  with g as (
    select array_agg(m[1] order by o) as grupos
    from regexp_matches(coalesce(p_texto, ''), '(\d+)', 'g') with ordinality as t(m, o)
  )
  select case when cardinality(grupos) >= 1 and length(grupos[cardinality(grupos)]) <= 12
              then grupos[cardinality(grupos)]::bigint end,
         case when cardinality(grupos) >= 2 and length(grupos[cardinality(grupos) - 1]) <= 6
              then grupos[cardinality(grupos) - 1]::integer end
  from g
$$;

-- ─── Recibos ────────────────────────────────────────────────────
drop function if exists public.listar_recibos(text, integer);

create function public.listar_recibos(
  p_texto   text    default null,
  p_limite  integer default 200,
  p_desde   date    default null,
  p_hasta   date    default null,
  p_persona text    default null,
  p_numero  text    default null,
  p_estado  text    default null   -- 'vigente' | 'anulado'
)
returns table(id uuid, serie text, numero bigint, fecha date, total numeric, cliente_id uuid, cliente_nombre text,
              medios text, orden_numero bigint, emitido_por_nombre text, mail_estado text,
              anulado_en timestamp with time zone, libre boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_texto   text := nullif(btrim(coalesce(p_texto, '')), '');
  v_digitos text := nullif(regexp_replace(coalesce(p_texto, ''), '\D', '', 'g'), '');
  v_persona text := nullif(btrim(coalesce(p_persona, '')), '');
  v_num     record;
  v_cuentas boolean := app.tiene_permiso('cuentacorriente.ver') or app.tiene_permiso('cuentacorriente.cobrar');
  v_fiados  boolean := app.tiene_permiso('fiados.ver');
begin
  if not (v_cuentas or v_fiados) then
    raise exception 'No tenés permiso para ver recibos.';
  end if;
  select * into v_num from app.numero_buscado(p_numero);

  return query
  select r.id, r.serie, r.numero, r.fecha, r.total, c.id,
         coalesce(c.nombre, fp.nombre || ' (fiado)', r.nombre_libre),
         (select string_agg(distinct mp.nombre, ', ') from public.recibo_pago rp
          join public.medio_pago mp on mp.id = rp.medio_pago_id where rp.recibo_id = r.id),
         o.numero, u.nombre, r.mail_estado, r.anulado_en, r.libre
  from public.recibo r
  left join public.cliente c on c.id = r.cliente_id
  left join public.fiado_persona fp on fp.id = r.fiado_persona_id
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario u on u.id = r.emitido_por
  where ((r.cliente_id is not null and v_cuentas) or (r.fiado_persona_id is not null and v_fiados)
         or (r.libre and v_cuentas))
    -- El buscador de siempre: nombre o número en un solo campo.
    and (v_texto is null
     or coalesce(c.nombre, fp.nombre, r.nombre_libre) ilike '%' || v_texto || '%'
     or coalesce(c.nombre_fantasia, '') ilike '%' || v_texto || '%'
     or (v_digitos is not null and length(v_digitos) <= 12
         and (r.numero = right(v_digitos, 8)::bigint or r.numero = v_digitos::bigint)))
    -- La búsqueda avanzada.
    and (p_desde is null or r.fecha >= p_desde)
    and (p_hasta is null or r.fecha <= p_hasta)
    and (v_persona is null
     or coalesce(c.nombre, fp.nombre, r.nombre_libre) ilike '%' || v_persona || '%'
     or coalesce(c.nombre_fantasia, '') ilike '%' || v_persona || '%')
    and (v_num.numero is null or r.numero = v_num.numero)
    and (v_num.serie is null
     or nullif(regexp_replace(r.serie, '\D', '', 'g'), '')::integer = v_num.serie)
    and (p_estado is null
     or (p_estado = 'vigente' and r.anulado_en is null)
     or (p_estado = 'anulado' and r.anulado_en is not null))
  order by r.emitido_en desc
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$function$;

revoke all on function public.listar_recibos(text, integer, date, date, text, text, text) from public, anon;
grant execute on function public.listar_recibos(text, integer, date, date, text, text, text) to authenticated, service_role;

-- ─── Pedidos del mayorista ──────────────────────────────────────
-- Con un filtro puesto, los facturados y cancelados dejan de cortarse
-- a los 60 días: manda el rango de fechas que se eligió.
drop function if exists public.mayorista_pedidos(text);

create function public.mayorista_pedidos(
  p_vista   text,
  p_desde   date default null,
  p_hasta   date default null,
  p_cliente text default null,
  p_numero  text default null
)
returns table(id uuid, numero bigint, estado text, cliente_id uuid, cliente_nombre text, cliente_localidad text,
              cliente_ruta text, cliente_domicilio text, cliente_telefono text, cliente_email text,
              cliente_condicion_iva_id smallint, vendedor_nombre text, observaciones text,
              armado_en timestamp with time zone, recibido_en timestamp with time zone,
              confirmado_en timestamp with time zone, confirmado_por_nombre text,
              facturado_en timestamp with time zone, cancelado_en timestamp with time zone,
              motivo_cancelacion text, total numeric, lineas jsonb, venta_id uuid, venta_codigo text,
              documentacion text, comprobante_id uuid, comprobante_numero text, comprobante_cae text,
              interno_id uuid, interno_numero text, remito_id uuid, remito_numero text,
              mail_destinatario text, mail_estado text, mail_error text, mail_en timestamp with time zone,
              cliente_vencido numeric, cliente_vencido_desde date, vencido_autorizado_en timestamp with time zone,
              vencido_autorizado_por_nombre text, cliente_pide_proforma boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_todo boolean := app.tiene_permiso('mayorista.atender');
  v_yo   uuid := app.usuario_actual_id();
  v_ve_deuda boolean := v_todo or app.tiene_permiso('mayorista.ver_deuda');
  v_cliente text := nullif(btrim(coalesce(p_cliente, '')), '');
  v_num  record;
  v_filtra boolean;
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;
  select * into v_num from app.numero_buscado(p_numero);
  v_filtra := p_desde is not null or p_hasta is not null or v_cliente is not null or v_num.numero is not null;

  return query
  select pm.id, pm.numero, pm.estado, c.id, c.nombre, c.localidad, c.ruta,
         nullif(concat_ws(' ', c.calle, c.numero), ''), c.telefono, c.email, c.condicion_iva_id,
         vend.nombre, pm.observaciones, pm.armado_en, pm.recibido_en, pm.confirmado_en, conf.nombre,
         pm.facturado_en, pm.cancelado_en, pm.motivo_cancelacion,
         coalesce((select sum(round(l.cantidad * l.precio, 2)) from public.pedido_mayorista_linea l where l.pedido_id = pm.id), 0),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'producto_id', l.producto_id, 'codigo', p.codigo, 'nombre', p.nombre_interno,
                    'cantidad', l.cantidad, 'precio', l.precio, 'precio_lista', l.precio_lista,
                    'stock', case when v_todo or app.tiene_permiso('mayorista.ver_stock') then coalesce(s.cantidad, 0) end)
                  order by l.orden)
           from public.pedido_mayorista_linea l
           join public.producto p on p.id = l.producto_id
           left join public.stock_saldo s on s.producto_id = l.producto_id
           where l.pedido_id = pm.id), '[]'::jsonb),
         v.id, v.codigo, v.documentacion,
         comp.id, comp.numero_texto, comp.cae,
         interno.id, interno.numero_texto,
         rem.id, rem.numero_texto,
         pm.mail_destinatario, pm.mail_estado, pm.mail_error, pm.mail_en,
         case when v_ve_deuda then coalesce(d.vencido_30 + d.vencido_60 + d.vencido_mas_60, 0) end,
         case when v_ve_deuda then d.vencimiento_mas_antiguo end,
         pm.vencido_autorizado_en, aut.nombre,
         c.pide_proforma
  from public.pedido_mayorista pm
  join public.cliente c on c.id = pm.cliente_id
  left join public.usuario vend on vend.id = pm.vendedor_id
  left join public.usuario conf on conf.id = pm.confirmado_por
  left join public.usuario aut on aut.id = pm.vencido_autorizado_por
  left join public.vista_deuda_antiguedad d on d.cliente_id = c.id
  left join public.venta v on v.id = pm.venta_id
  left join lateral (
    select co.id, co.numero, pv.numero as pv_numero,
           lpad(pv.numero::text, 4, '0') || '-' || lpad(co.numero::text, 8, '0') as numero_texto,
           co.cae
    from public.comprobante co
    left join public.punto_venta pv on pv.id = co.punto_venta_id
    where co.venta_id = pm.venta_id and co.estado <> 'anulado'
    order by co.creado_en desc limit 1
  ) comp on true
  left join lateral (
    select n.id, n.numero, n.serie, n.serie || '-' || lpad(n.numero::text, 8, '0') as numero_texto
    from public.comprobante_no_fiscal n
    where n.venta_id = pm.venta_id and n.tipo_clave = 'comprobante_interno' and n.anulado_en is null
    order by n.creado_en desc limit 1
  ) interno on true
  left join lateral (
    select n.id, n.numero, n.serie, n.serie || '-' || lpad(n.numero::text, 8, '0') as numero_texto
    from public.comprobante_no_fiscal n
    where n.venta_id = pm.venta_id and n.tipo_clave = 'remito' and n.anulado_en is null
    order by n.creado_en desc limit 1
  ) rem on true
  where (v_todo or pm.vendedor_id = v_yo)
    and case p_vista
          when 'pendientes' then pm.estado in ('pendiente', 'confirmado')
          when 'facturados' then pm.estado = 'facturado' and (v_filtra or pm.facturado_en > now() - interval '60 days')
          when 'cancelados' then pm.estado = 'cancelado' and (v_filtra or pm.cancelado_en > now() - interval '60 days')
          else true
        end
    and (p_desde is null or pm.recibido_en >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'))
    and (p_hasta is null or pm.recibido_en < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
    and (v_cliente is null
     or c.nombre ilike '%' || v_cliente || '%'
     or coalesce(c.nombre_fantasia, '') ilike '%' || v_cliente || '%')
    -- El número del pedido, o el de su factura, proforma o remito.
    and (v_num.numero is null
     or (v_num.serie is null and pm.numero = v_num.numero)
     or (comp.numero = v_num.numero and (v_num.serie is null or comp.pv_numero = v_num.serie))
     or (interno.numero = v_num.numero and (v_num.serie is null
          or nullif(regexp_replace(interno.serie, '\D', '', 'g'), '')::integer = v_num.serie))
     or (rem.numero = v_num.numero and (v_num.serie is null
          or nullif(regexp_replace(rem.serie, '\D', '', 'g'), '')::integer = v_num.serie)))
  order by pm.recibido_en desc
  limit 300;
end;
$function$;

revoke all on function public.mayorista_pedidos(text, date, date, text, text) from public, anon;
grant execute on function public.mayorista_pedidos(text, date, date, text, text) to authenticated, service_role;
