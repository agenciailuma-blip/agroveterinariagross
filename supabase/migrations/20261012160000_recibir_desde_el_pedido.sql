-- ═══════════════════════════════════════════════════════════════
-- Recibir la mercadería desde el pedido
--
-- Lo que faltaba del pedido a proveedor (docs/pedidos-lucas-2026-10-07.md,
-- punto 3): «cuando llega la mercadería, la recepción arranca desde esa
-- orden con los productos y las cantidades puestos, y dice qué no vino».
--
-- No se toca recibir_mercaderia, que mueve stock y costo y anda desde el
-- 28/09. La factura se ata al pedido antes de recibir —«Traer el
-- pedido»—, y cuando la mercadería entra, un disparador mira cuánto
-- llegó de cada cosa:
--
--   · si llegó todo, el pedido queda recibido solo;
--   · si llegó una parte, sigue pedido y dice qué falta; el resto puede
--     venir en otra factura, atada al mismo pedido;
--   · si lo que falta no viene, se da por terminado a mano, con motivo.
--
-- Dar de baja una factura que había completado un pedido lo vuelve a
-- dejar pedido. Y un pedido con mercadería recibida ya no se anula: el
-- stock entró, y devolver las órdenes internas a pendiente haría pedir
-- dos veces lo mismo.
--
-- De paso, lo que quedaba de la orden interna: si una orden era para un
-- cliente, el pedido lo dice, para avisarle cuando llega.
-- ═══════════════════════════════════════════════════════════════

-- ── La factura sabe de qué pedido es ────────────────────────────
alter table public.compra
  add column pedido_id uuid references public.pedido_proveedor(id) on delete set null;

create index compra_pedido_idx on public.compra (pedido_id) where pedido_id is not null;

comment on column public.compra.pedido_id is
  'El pedido a proveedor que trae esta factura. Un pedido puede llegar en varias facturas.';

-- ── El pedido, recibido ─────────────────────────────────────────
alter table public.pedido_proveedor drop constraint pedido_proveedor_estado_check;
alter table public.pedido_proveedor add constraint pedido_proveedor_estado_check
  check (estado in ('pedido', 'recibido', 'anulado'));

alter table public.pedido_proveedor
  add column recibido_en   timestamptz,
  add column recibido_por  uuid references public.usuario(id) on delete set null,
  -- Sólo si se dio por terminado a mano: por qué no se espera lo que falta.
  add column motivo_cierre text;

comment on column public.pedido_proveedor.motivo_cierre is
  'Si se dio por recibido sin que llegara todo: por qué. Vacío si llegó todo y se cerró solo.';

-- ── Cuánto llegó de cada renglón ────────────────────────────────
/*
  Lo recibido por las facturas atadas al pedido que no se dieron de
  baja, por producto. Los renglones que no están en el catálogo no se
  pueden recibir por el sistema: no cuentan para decir si llegó todo.
*/
create or replace function app.falta_del_pedido(p_pedido_id uuid)
returns table (producto_id uuid, pedido numeric, recibido numeric, falta numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with pedido as (
    select l.producto_id, sum(l.cantidad) as cantidad
      from public.pedido_proveedor_linea l
     where l.pedido_id = p_pedido_id and l.producto_id is not null
     group by l.producto_id
  ),
  recibido as (
    select cl.producto_id, sum(cl.cantidad) as cantidad
      from public.compra c
      join public.compra_linea cl on cl.compra_id = c.id
     where c.pedido_id = p_pedido_id
       and c.eliminado_en is null
       and c.recibida_en is not null
     group by cl.producto_id
  )
  select p.producto_id, p.cantidad, coalesce(r.cantidad, 0),
         greatest(0, p.cantidad - coalesce(r.cantidad, 0))
    from pedido p
    left join recibido r on r.producto_id = p.producto_id;
$$;

/*
  Mira el pedido y le pone el estado que corresponde. Si llegó todo, lo
  da por recibido; si se había cerrado solo y una factura se dio de baja,
  lo vuelve a pedido. Uno cerrado a mano no se toca: alguien decidió que
  lo que faltaba no viene.
*/
create or replace function app.revisar_pedido_recibido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_completo boolean;
begin
  if p_pedido_id is null then
    return;
  end if;

  select count(*) > 0 and bool_and(f.falta = 0) into v_completo
    from app.falta_del_pedido(p_pedido_id) f;

  if v_completo then
    update public.pedido_proveedor
       set estado = 'recibido', recibido_en = now(), recibido_por = app.usuario_actual_id()
     where id = p_pedido_id and estado = 'pedido';
  else
    update public.pedido_proveedor
       set estado = 'pedido', recibido_en = null, recibido_por = null
     where id = p_pedido_id and estado = 'recibido' and motivo_cierre is null;
  end if;
end;
$$;

create or replace function app.compra_revisa_su_pedido()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform app.revisar_pedido_recibido(new.pedido_id);
  if old.pedido_id is distinct from new.pedido_id then
    perform app.revisar_pedido_recibido(old.pedido_id);
  end if;
  return null;
end;
$$;

create trigger compra_revisa_su_pedido
  after update of recibida_en, eliminado_en, pedido_id on public.compra
  for each row
  when (new.pedido_id is not null or old.pedido_id is not null)
  execute function app.compra_revisa_su_pedido();

-- ── Atar la factura al pedido ───────────────────────────────────
/*
  «Traer el pedido» al recibir una factura. Sólo antes de recibir: una
  vez que la mercadería entró, lo que trajo ya está contado. Con nada en
  el pedido, la desata.
*/
create or replace function public.atar_compra_a_pedido(p_compra_id uuid, p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_compra public.compra;
  v_pedido public.pedido_proveedor;
begin
  if not app.tiene_permiso('compras.registrar') then
    raise exception 'No tenés permiso para recibir mercadería.';
  end if;

  select * into v_compra from public.compra where id = p_compra_id for update;
  if v_compra.id is null or v_compra.eliminado_en is not null then
    raise exception 'Esa factura de compra no existe o está dada de baja.';
  end if;
  if v_compra.recibida_en is not null then
    raise exception 'La mercadería de esa factura ya se recibió: no se puede cambiar de qué pedido es.';
  end if;

  if p_pedido_id is not null then
    select * into v_pedido from public.pedido_proveedor where id = p_pedido_id;
    if v_pedido.id is null then
      raise exception 'Ese pedido no existe.';
    end if;
    if v_pedido.proveedor_id <> v_compra.proveedor_id then
      raise exception 'El pedido % es a otro proveedor.', v_pedido.numero;
    end if;
    if v_pedido.estado <> 'pedido' then
      raise exception 'El pedido % ya está %.', v_pedido.numero,
        case v_pedido.estado when 'recibido' then 'recibido' else 'anulado' end;
    end if;
  end if;

  update public.compra set pedido_id = p_pedido_id where id = p_compra_id;
end;
$$;

revoke all on function public.atar_compra_a_pedido(uuid, uuid) from public, anon;
grant execute on function public.atar_compra_a_pedido(uuid, uuid) to authenticated;

-- ── Lo que falta recibir ────────────────────────────────────────
/*
  Los pedidos a un proveedor que esperan mercadería, para ofrecerlos al
  recibir una de sus facturas.
*/
create or replace function public.pedidos_por_recibir(p_proveedor_id uuid)
returns table (id uuid, numero bigint, fecha date, renglones bigint, llego_algo boolean)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  return query
  select p.id, p.numero, p.fecha,
         (select count(*) from public.pedido_proveedor_linea l where l.pedido_id = p.id),
         exists (select 1 from public.compra c
                  where c.pedido_id = p.id and c.eliminado_en is null and c.recibida_en is not null)
    from public.pedido_proveedor p
   where p.proveedor_id = p_proveedor_id and p.estado = 'pedido'
   order by p.fecha, p.numero;
end;
$$;

revoke all on function public.pedidos_por_recibir(uuid) from public, anon;
grant execute on function public.pedidos_por_recibir(uuid) to authenticated;

/*
  Lo que falta llegar de un pedido, listo para cargar en la recepción:
  cada producto con lo que hace falta para recibirlo, y la cantidad que
  todavía no vino. Los renglones que no están en el catálogo vienen
  aparte, sin producto, para avisar que hay que darlos de alta.
*/
create or replace function public.pedido_para_recibir(p_pedido_id uuid)
returns table (
  producto_id     uuid,
  codigo          text,
  descripcion     text,
  costo           numeric,
  alicuota_iva_id smallint,
  pedido          numeric,
  recibido        numeric,
  falta           numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  return query
  select p.id, p.codigo, p.nombre_interno, p.costo, p.alicuota_iva_id, f.pedido, f.recibido, f.falta
    from app.falta_del_pedido(p_pedido_id) f
    join public.producto p on p.id = f.producto_id
   where f.falta > 0
  union all
  select null::uuid, null::text, l.descripcion, null::numeric, null::smallint, l.cantidad, 0::numeric, l.cantidad
    from public.pedido_proveedor_linea l
   where l.pedido_id = p_pedido_id and l.producto_id is null
  order by 1 nulls last, 3;
end;
$$;

revoke all on function public.pedido_para_recibir(uuid) from public, anon;
grant execute on function public.pedido_para_recibir(uuid) to authenticated;

-- ── Darlo por terminado sin que llegue todo ─────────────────────
create or replace function public.cerrar_pedido_proveedor(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pedido public.pedido_proveedor;
begin
  if not app.tiene_permiso('compras.registrar') then
    raise exception 'No tenés permiso para cerrar pedidos a proveedores.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Para darlo por terminado hay que decir por qué no se espera lo que falta.';
  end if;

  select * into v_pedido from public.pedido_proveedor where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'Ese pedido no existe.';
  end if;
  if v_pedido.estado <> 'pedido' then
    raise exception 'El pedido % ya está %.', v_pedido.numero, v_pedido.estado;
  end if;

  update public.pedido_proveedor
     set estado = 'recibido', recibido_en = now(), recibido_por = app.usuario_actual_id(),
         motivo_cierre = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke all on function public.cerrar_pedido_proveedor(uuid, text) from public, anon;
grant execute on function public.cerrar_pedido_proveedor(uuid, text) to authenticated;

-- ── Con mercadería recibida, no se anula ────────────────────────
create or replace function public.anular_pedido_proveedor(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido  public.pedido_proveedor;
  v_ordenes uuid[];
  v_factura text;
begin
  if not app.tiene_permiso('compras.registrar') then
    raise exception 'No tenés permiso para anular pedidos a proveedores.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Para anular un pedido hay que decir por qué.';
  end if;

  select * into v_pedido from public.pedido_proveedor where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'Ese pedido no existe.';
  end if;
  if v_pedido.estado = 'anulado' then
    raise exception 'El pedido % ya estaba anulado.', v_pedido.numero;
  end if;

  -- El stock ya entró: anularlo devolvería las órdenes a pendiente y se
  -- pediría dos veces lo mismo.
  select lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0') into v_factura
    from public.compra c
   where c.pedido_id = p_id and c.eliminado_en is null and c.recibida_en is not null
   limit 1;
  if v_factura is not null then
    raise exception 'Del pedido % ya llegó mercadería (factura %): no se anula. Si lo que falta no viene, dalo por terminado.',
      v_pedido.numero, v_factura;
  end if;

  select coalesce(array_agg(distinct l.orden_id), '{}') into v_ordenes
    from public.orden_compra_interna_linea l where l.pedido_id = p_id;

  update public.orden_compra_interna_linea set pedido_id = null where pedido_id = p_id;

  update public.orden_compra_interna
     set estado = 'pendiente', pedida_en = null, pedida_por = null
   where id = any (v_ordenes) and estado = 'pedida';

  -- Una factura atada pero todavía sin recibir queda libre.
  update public.compra set pedido_id = null where pedido_id = p_id and recibida_en is null;

  update public.pedido_proveedor
     set estado = 'anulado', anulado_en = now(), anulado_por = app.usuario_actual_id(),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

-- ── La lista dice si llegó algo ─────────────────────────────────
drop function public.pedidos_a_proveedores(text, int);

create function public.pedidos_a_proveedores(p_estado text default null, p_limite int default 100)
returns table (
  id          uuid,
  numero      bigint,
  fecha       date,
  proveedor   text,
  estado      text,
  renglones   bigint,
  total       numeric,
  observacion text,
  creado_por  text,
  llego_algo  boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  return query
  select p.id, p.numero, p.fecha, pr.nombre, p.estado,
         (select count(*) from public.pedido_proveedor_linea l where l.pedido_id = p.id),
         (select round(sum(l.cantidad * l.costo), 2) from public.pedido_proveedor_linea l where l.pedido_id = p.id),
         p.observacion, u.nombre,
         exists (select 1 from public.compra c
                  where c.pedido_id = p.id and c.eliminado_en is null and c.recibida_en is not null)
    from public.pedido_proveedor p
    join public.proveedor pr on pr.id = p.proveedor_id
    left join public.usuario u on u.id = p.creado_por
   where p_estado is null or p.estado = p_estado
   order by p.fecha desc, p.numero desc
   limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;

revoke all on function public.pedidos_a_proveedores(text, int) from public, anon;
grant execute on function public.pedidos_a_proveedores(text, int) to authenticated;

-- ── El pedido entero dice qué llegó, en qué facturas y a quién avisar ──
create or replace function public.pedido_a_proveedor(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_resultado jsonb;
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  select jsonb_build_object(
           'id', p.id, 'numero', p.numero, 'fecha', p.fecha,
           'proveedor_id', p.proveedor_id, 'proveedor', pr.nombre,
           'proveedor_cuit', pr.numero_documento, 'proveedor_contacto', pr.contacto,
           'proveedor_telefono', pr.telefono, 'proveedor_email', pr.email,
           'observacion', p.observacion, 'estado', p.estado,
           'minimo_tipo', p.minimo_tipo, 'minimo_valor', p.minimo_valor,
           'creado_por', u.nombre, 'creado_en', p.creado_en,
           'anulado_por', ua.nombre, 'anulado_en', p.anulado_en, 'motivo_anulacion', p.motivo_anulacion,
           'recibido_por', ur.nombre, 'recibido_en', p.recibido_en, 'motivo_cierre', p.motivo_cierre,
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'renglon', l.renglon, 'producto_id', l.producto_id, 'codigo', l.codigo,
                      'descripcion', l.descripcion, 'cantidad', l.cantidad, 'costo', l.costo,
                      'peso_kg', l.peso_kg, 'unidades_por_bulto', l.unidades_por_bulto,
                      'recibido', f.recibido)
                    order by l.renglon)
               from public.pedido_proveedor_linea l
               left join app.falta_del_pedido(p.id) f on f.producto_id = l.producto_id
              where l.pedido_id = p.id), '[]'::jsonb),
           'ordenes', coalesce((
             select jsonb_agg(distinct o.numero)
               from public.orden_compra_interna_linea l
               join public.orden_compra_interna o on o.id = l.orden_id
              where l.pedido_id = p.id), '[]'::jsonb),
           'facturas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'fecha', c.fecha,
                      'numero', lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0'),
                      'recibida_en', c.recibida_en)
                    order by c.fecha, c.numero)
               from public.compra c
              where c.pedido_id = p.id and c.eliminado_en is null), '[]'::jsonb),
           -- Las órdenes que eran para un cliente: a quién avisarle cuando llega.
           'avisar', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'orden', a.numero, 'cliente', a.cliente, 'contacto', a.contacto, 'que', a.que)
                    order by a.numero)
               from (select o.numero, c.nombre as cliente, o.contacto,
                            string_agg(l.descripcion, ', ' order by l.renglon) as que
                       from public.orden_compra_interna_linea l
                       join public.orden_compra_interna o on o.id = l.orden_id
                       left join public.cliente c on c.id = o.cliente_id
                      where l.pedido_id = p.id
                        and (o.cliente_id is not null or nullif(btrim(coalesce(o.contacto, '')), '') is not null)
                      group by o.numero, c.nombre, o.contacto) a), '[]'::jsonb))
    into v_resultado
    from public.pedido_proveedor p
    join public.proveedor pr on pr.id = p.proveedor_id
    left join public.usuario u on u.id = p.creado_por
    left join public.usuario ua on ua.id = p.anulado_por
    left join public.usuario ur on ur.id = p.recibido_por
   where p.id = p_id;

  return v_resultado;
end;
$$;
