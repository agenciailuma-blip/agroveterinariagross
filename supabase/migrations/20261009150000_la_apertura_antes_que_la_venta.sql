-- ═══════════════════════════════════════════════════════════════
-- En el historial, lo que sale de abrir una caja va antes que la venta
--
-- Visto en pantalla el 09/10, en el historial de una pastilla suelta: la
-- venta y la apertura de la caja que la hizo posible pasan en el mismo
-- instante —llevan la misma hora a propósito— y llegan en la misma
-- transacción. El desempate quedaba librado al id, que es al azar: la
-- mitad de las veces el historial decía «Venta −1, queda −1» y después
-- «Salió de abrir un envase +10, queda 9». El saldo final era el mismo,
-- pero el renglón del medio mentía.
--
-- En la realidad se abre la caja y después se vende la pastilla. A la
-- misma hora, `fraccionamiento` va primero. En tres niveles sale bien
-- solo: en la tableta, la entrada desde la caja va antes que la salida
-- hacia la pastilla.
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
           case when m.tipo = 'fraccionamiento' then 0 else 1 end as antes,
           count(*) over () as cuantos
      from public.movimiento_stock m
     where m.producto_id = p_producto_id
       and (p_deposito_id is null or m.deposito_id = p_deposito_id)
  ),
  con_saldo as (
    select l.*,
           sum(l.cantidad) over (order by l.ocurrido_en, l.antes, l.creado_en, l.id
                                 rows between unbounded preceding and current row) as saldo_despues
      from libro l
  )
  select l.id, l.ocurrido_en, l.tipo, l.cantidad, l.saldo_despues, l.motivo,
         u.nombre,
         -- El vendedor sólo si no es el mismo que registró: en la caja,
         -- el cajero cobra lo que armó otro.
         case when l.operador_id is distinct from l.usuario_id then o.nombre end,
         t.nombre, d.nombre, l.registrado_offline, l.cuantos
    from con_saldo l
    left join public.usuario  u on u.id = l.usuario_id
    left join public.usuario  o on o.id = l.operador_id
    left join public.terminal t on t.id = l.terminal_id
    left join public.deposito d on d.id = l.deposito_id
   order by l.ocurrido_en desc, l.antes desc, l.creado_en desc, l.id desc
   limit greatest(1, least(coalesce(p_limite, 100), 1000));
end;
$$;
