-- ═══════════════════════════════════════════════════════════════
-- El historial de movimientos de un producto
--
-- Hueco del alcance de V1-A encontrado el 05/10: el §4 promete el
-- stock «con historial de cómo llegó a ese número», y el punto 2 de
-- terminado, que la venta descuente stock y «el movimiento queda con
-- usuario y hora». El libro lo guardaba todo desde agosto —quién,
-- cuándo, en qué máquina y por qué—, pero no se veía en ningún lado.
--
-- Una sola función de lectura, sin nada nuevo que guardar.
--
-- El saldo después de cada movimiento se calcula acá, sumando el libro
-- en orden, y no se guarda: el libro es la verdad y el saldo una foto.
-- Se ordena por cuándo pasó (`ocurrido_en`, el reloj de la máquina) y
-- no por cuándo llegó: una venta hecha sin internet a las 10 y subida
-- a las 14 va donde ocurrió. El último saldo da igual en cualquier
-- orden, y es el que muestra la pantalla de Stock.
--
-- El documento no se busca en otras tablas: el motivo de cada
-- movimiento ya lo nombra («Venta CAJA1-000010», «Factura de compra
-- 0002-00000501», «Transferencia 7 desde Local»), porque lo escribe
-- quien lo registra.
--
-- Con permiso de dueño, para poder nombrar a las personas —la lista de
-- usuarios no la ve cualquiera—, y por eso controla `stock.ver` a mano:
-- quien ve el stock puede ver quién lo movió.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.movimientos_de_producto(
  p_producto_id uuid,
  p_deposito_id uuid default null,
  p_limite      int  default 100
)
returns table (
  id                 uuid,
  ocurrido_en        timestamptz,
  tipo               text,
  cantidad           numeric,
  saldo              numeric,
  motivo             text,
  usuario            text,
  vendedor           text,
  terminal           text,
  deposito           text,
  registrado_offline boolean,
  total              bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('stock.ver') then
    raise exception 'No tenés permiso para ver el stock.';
  end if;

  return query
  with libro as (
    select m.*,
           sum(m.cantidad) over (order by m.ocurrido_en, m.creado_en, m.id
                                 rows between unbounded preceding and current row) as saldo_despues,
           count(*) over () as cuantos
      from public.movimiento_stock m
     where m.producto_id = p_producto_id
       and (p_deposito_id is null or m.deposito_id = p_deposito_id)
  )
  select l.id, l.ocurrido_en, l.tipo, l.cantidad, l.saldo_despues, l.motivo,
         u.nombre,
         -- El vendedor sólo si no es el mismo que registró: en la caja,
         -- el cajero cobra lo que armó otro.
         case when l.operador_id is distinct from l.usuario_id then o.nombre end,
         t.nombre, d.nombre, l.registrado_offline, l.cuantos
    from libro l
    left join public.usuario  u on u.id = l.usuario_id
    left join public.usuario  o on o.id = l.operador_id
    left join public.terminal t on t.id = l.terminal_id
    left join public.deposito d on d.id = l.deposito_id
   order by l.ocurrido_en desc, l.creado_en desc, l.id desc
   limit greatest(1, least(coalesce(p_limite, 100), 1000));
end;
$$;

comment on function public.movimientos_de_producto(uuid, uuid, int) is
  'El libro de stock de un producto, del más nuevo al más viejo, con el saldo después de cada movimiento y quién lo hizo. Con depósito, el de ese depósito. Pide stock.ver.';

revoke all on function public.movimientos_de_producto(uuid, uuid, int) from public;
grant execute on function public.movimientos_de_producto(uuid, uuid, int) to authenticated;
