/*
  ─────────────────────────────────────────────────────────────
  Reportes avanzados: la mercadería y las ventas por producto

  Lo pidió Gross el 23/11: cuánto vale la mercadería que hay en stock,
  las ventas por rubro de ARCA y las ventas online. Se sumaron la
  mercadería parada y el margen, que salen de los mismos datos.

  Son dos funciones y no cinco. La base devuelve los renglones ya
  juntados por producto y la pantalla arma cada corte (por rubro, por
  canal, por categoría, el margen, lo parado): son cientos de filas, no
  cientos de miles, y así cambiar de corte o de días no vuelve a
  preguntar.

  ─── QUÉ ES CADA NÚMERO ───

  · El costo es el del producto hoy, CON IVA: es lo que guarda la
    recepción de mercadería (`app.costo_con_iva`). El precio de venta
    también es con IVA. Así el margen compara peras con peras, igual que
    `vista_stock.margen_real`.
  · El margen usa el costo de HOY y no el del día de la venta, porque la
    línea de venta no guarda el costo. Con precios que se mueven todos
    los meses es una aproximación, y la pantalla lo dice.
  · Vendido: las ventas cobradas del período menos las devoluciones
    hechas en el período, por el día en que pasaron. Es el mismo
    criterio que las estadísticas del mayorista.
  · Facturado: la venta tiene un comprobante de ARCA autorizado (o en
    contingencia). Al contador le sirve separar eso de lo que salió
    sin factura.
  · Canal: online si entró por la tienda; mayorista si salió de un
    pedido mayorista; local todo lo demás.
  ─────────────────────────────────────────────────────────────
*/

create or replace function public.reporte_mercaderia(p_ahora timestamptz default now())
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
begin
  if not app.tiene_permiso('reportes.ver') then
    raise exception 'No tenés permiso para ver los reportes.';
  end if;

  return json_build_object(
    'hoy', (p_ahora at time zone v_tz)::date,
    -- Desde cuándo hay ventas en el sistema. «Nunca se vendió» quiere
    -- decir «no se vendió desde esta fecha», y la pantalla lo aclara.
    'primera_venta', (
      select min((v.cobrada_en at time zone v_tz)::date)
      from public.venta v
      where v.estado = 'cobrada'
    ),
    'productos', coalesce((
      with recursive raiz as (
        select c.id, c.nombre as raiz_nombre
        from public.categoria c
        where c.padre_id is null
        union all
        select c.id, r.raiz_nombre
        from public.categoria c
        join raiz r on c.padre_id = r.id
      ),
      ult_venta as (
        select l.producto_id, max(v.cobrada_en) as en
        from public.venta_linea l
        join public.venta v on v.id = l.venta_id
        where v.estado = 'cobrada' and l.producto_id is not null
        group by l.producto_id
      ),
      /*
        La última vez que entró mercadería nueva. Un producto que se
        compró la semana pasada y todavía no se vendió no está parado:
        recién llegó. El ajuste no cuenta: corrige un conteo, no trae
        mercadería.
      */
      ult_entrada as (
        select m.producto_id, max(m.ocurrido_en) as en
        from public.movimiento_stock m
        where m.cantidad > 0 and m.tipo in ('compra', 'carga_inicial', 'apertura')
        group by m.producto_id
      )
      select json_agg(json_build_object(
        'id',             p.id,
        'codigo',         p.codigo,
        'nombre',         p.nombre_interno,
        'categoria',      r.raiz_nombre,
        'rubro_arca_id',  p.rubro_arca_id,
        'proveedor',      pr.nombre,
        'cantidad',       s.cantidad,
        'costo',          nullif(p.costo, 0),
        'precio',         nullif(p.precio_venta, 0),
        'ultima_venta',   (uv.en at time zone v_tz)::date,
        'ultima_entrada', (ue.en at time zone v_tz)::date
      ) order by p.nombre_interno)
      from public.producto p
      join public.stock_saldo s on s.producto_id = p.id and s.cantidad <> 0
      left join raiz r on r.id = p.categoria_id
      left join public.proveedor pr on pr.id = p.proveedor_id
      left join ult_venta uv on uv.producto_id = p.id
      left join ult_entrada ue on ue.producto_id = p.id
      where p.eliminado_en is null
    ), '[]'::json),
    'depositos', coalesce((
      select json_agg(x order by x.principal desc, x.nombre)
      from (
        select
          d.nombre,
          d.es_principal as principal,
          coalesce(sum(sd.cantidad) filter (where sd.cantidad > 0), 0) as unidades,
          coalesce(sum(sd.cantidad * p.costo)
                   filter (where sd.cantidad > 0 and p.costo > 0), 0) as valor_costo,
          coalesce(sum(sd.cantidad * p.precio_venta)
                   filter (where sd.cantidad > 0 and p.precio_venta > 0), 0) as valor_venta,
          count(*) filter (where sd.cantidad > 0 and coalesce(p.costo, 0) = 0) as sin_costo
        from public.stock_deposito sd
        join public.deposito d on d.id = sd.deposito_id
        join public.producto p on p.id = sd.producto_id
        where p.eliminado_en is null and d.eliminado_en is null
        group by d.id, d.nombre, d.es_principal
      ) x
    ), '[]'::json)
  );
end;
$$;

comment on function public.reporte_mercaderia is
  'Cada producto con stock, con su costo y precio de hoy, su última venta y su última entrada de mercadería; y el valor por depósito. La pantalla arma el valor del stock y la mercadería parada.';

revoke all on function public.reporte_mercaderia(timestamptz) from public, anon;
grant execute on function public.reporte_mercaderia(timestamptz) to authenticated, service_role;


create or replace function public.reporte_ventas(p_desde date, p_hasta date)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
begin
  if not app.tiene_permiso('reportes.ver') then
    raise exception 'No tenés permiso para ver los reportes.';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no se entiende.';
  end if;

  return (
    with recursive raiz as (
      select c.id, c.nombre as raiz_nombre
      from public.categoria c
      where c.padre_id is null
      union all
      select c.id, r.raiz_nombre
      from public.categoria c
      join raiz r on c.padre_id = r.id
    ),
    -- Las ventas cobradas del período.
    del_periodo as (
      select v.id, v.total
      from public.venta v
      where v.estado = 'cobrada'
        and (coalesce(v.cobrada_en, v.ocurrido_en) at time zone v_tz)::date between p_desde and p_hasta
    ),
    -- Las devoluciones hechas en el período, de ventas que siguen cobradas.
    devoluciones as (
      select d.id, d.venta_id, d.total
      from public.devolucion d
      join public.venta v on v.id = d.venta_id
      where v.estado = 'cobrada'
        and (d.ocurrido_en at time zone v_tz)::date between p_desde and p_hasta
    ),
    -- Toda venta que aparece por un lado o por el otro, con su canal.
    tocadas as (
      select x.venta_id,
        case
          when exists (select 1 from public.pedido_tienda t where t.venta_id = x.venta_id) then 'online'
          when exists (select 1 from public.pedido_mayorista pm where pm.venta_id = x.venta_id) then 'mayorista'
          else 'local'
        end as canal,
        exists (
          select 1 from public.comprobante c
          where c.venta_id = x.venta_id and c.estado in ('autorizado', 'contingencia', 'informado')
        ) as facturado
      from (
        select id as venta_id from del_periodo
        union
        select venta_id from devoluciones
      ) x
    ),
    movimientos as (
      select l.venta_id, l.id as linea_id, l.cantidad, l.importe
      from public.venta_linea l
      join del_periodo dp on dp.id = l.venta_id
      union all
      select dv.venta_id, dl.venta_linea_id, -dl.cantidad, -dl.importe
      from public.devolucion_linea dl
      join devoluciones dv on dv.id = dl.devolucion_id
    ),
    lineas as (
      select
        l.producto_id,
        coalesce(p.codigo, l.codigo_producto) as codigo,
        coalesce(p.nombre_interno, l.descripcion) as descripcion,
        r.raiz_nombre as categoria,
        p.rubro_arca_id,
        t.canal,
        t.facturado,
        sum(m.cantidad) as cantidad,
        sum(m.importe) as importe,
        -- Sin IVA, alícuota por alícuota: un promedio daría mal.
        sum(case when l.condicion_iva = 'gravado' and a.porcentaje > 0
                 then m.importe / (1 + a.porcentaje / 100)
                 else m.importe end) as neto,
        nullif(p.costo, 0) as costo
      from movimientos m
      join public.venta_linea l on l.id = m.linea_id
      join tocadas t on t.venta_id = m.venta_id
      left join public.producto p on p.id = l.producto_id
      left join raiz r on r.id = p.categoria_id
      left join public.alicuota_iva a on a.id = l.alicuota_iva_id
      group by l.producto_id, coalesce(p.codigo, l.codigo_producto),
               coalesce(p.nombre_interno, l.descripcion), r.raiz_nombre,
               p.rubro_arca_id, t.canal, t.facturado, p.costo
    ),
    canales as (
      select t.canal,
        count(dp.id) as ventas,
        coalesce(sum(dp.total), 0) as vendido,
        coalesce((select sum(dv.total) from devoluciones dv
                  join tocadas t2 on t2.venta_id = dv.venta_id
                  where t2.canal = t.canal), 0) as devuelto
      from tocadas t
      left join del_periodo dp on dp.id = t.venta_id
      group by t.canal
    )
    select json_build_object(
      'lineas', coalesce((
        select json_agg(json_build_object(
          'producto_id',   producto_id,
          'codigo',        codigo,
          'descripcion',   descripcion,
          'categoria',     categoria,
          'rubro_arca_id', rubro_arca_id,
          'canal',         canal,
          'facturado',     facturado,
          'cantidad',      cantidad,
          'importe',       round(importe, 2),
          'neto',          round(neto, 2),
          'costo',         costo
        ))
        from lineas
        where cantidad <> 0 or importe <> 0
      ), '[]'::json),
      'canales', coalesce((
        select json_agg(json_build_object(
          'canal', canal, 'ventas', ventas, 'vendido', vendido, 'devuelto', devuelto))
        from canales
      ), '[]'::json),
      'rubros', coalesce((
        select json_agg(json_build_object('id', ra.id, 'descripcion', ra.descripcion) order by ra.orden)
        from public.rubro_arca ra
      ), '[]'::json)
    )
  );
end;
$$;

comment on function public.reporte_ventas is
  'Lo vendido en el período por producto, canal (local, online, mayorista) y si se facturó, con las devoluciones restadas, el neto sin IVA y el costo de hoy. La pantalla arma las ventas por rubro de ARCA, las online y el margen.';

revoke all on function public.reporte_ventas(date, date) from public, anon;
grant execute on function public.reporte_ventas(date, date) to authenticated, service_role;
