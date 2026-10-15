-- ═══════════════════════════════════════════════════════════════
-- Un pedido de CAE por vez en cada serie
--
-- El riesgo, anotado el 14/10: dos pedidos de CAE para el mismo
-- comprobante a la vez —un reintento apretado mientras el primero
-- sigue— pueden sacar dos números autorizados para una sola venta. El
-- primero pide el 28 y ARCA lo autoriza; antes de que lo guarde, el
-- segundo le pregunta a ARCA el último, le dicen 28, renumera el
-- comprobante al 29 y pide otro CAE. Para ARCA quedan dos facturas;
-- acá, una sola venta.
--
-- Pasa lo mismo entre dos comprobantes distintos de la misma serie:
-- la alineación de uno puede correr al otro de número mientras su CAE
-- está en camino.
--
-- La función que le pide el CAE a ARCA habla con la base en varias
-- llamadas sueltas, así que un bloqueo de transacción no le sirve: se
-- soltaría en la primera. Por eso es un turno anotado en una fila, con
-- vencimiento: el que lo toma pone hasta cuándo lo necesita, y si la
-- función se muere a mitad de camino el turno vence solo. El que llega
-- después espera a que se libere.
--
-- La serie es el punto de venta y el tipo de comprobante: es la
-- numeración que ARCA lleva por separado.
-- ═══════════════════════════════════════════════════════════════

create table public.turno_pedido_cae (
  punto_venta_id      uuid        not null references public.punto_venta(id) on delete cascade,
  tipo_comprobante_id smallint    not null,
  comprobante_id      uuid        not null,
  ficha               uuid        not null,
  hasta               timestamptz not null,
  tomado_en           timestamptz not null default now(),
  primary key (punto_venta_id, tipo_comprobante_id)
);

comment on table public.turno_pedido_cae is
  'Quién le está pidiendo un CAE a ARCA en cada serie, y hasta cuándo. Lo usa sólo la función arca-wsfe-solicitar-cae.';

-- Sin políticas: sólo la función, con la llave de servicio, la toca.
alter table public.turno_pedido_cae enable row level security;
revoke all on public.turno_pedido_cae from public, anon, authenticated;
grant select, insert, update, delete on public.turno_pedido_cae to service_role;

-- ───────────────────────────────────────────────────────────────
-- Tomar el turno
--
-- Una sola sentencia: si la serie está libre o su turno venció, queda
-- tomada por esta ficha; si no, no cambia nada. Dos pedidos que llegan
-- juntos no pueden ganar los dos: el segundo espera a que el primero
-- termine de escribir y vuelve a mirar el vencimiento.
--
-- Devuelve si se tomó y, si no, para qué comprobante está tomado: si
-- es el mismo, la función sabe que es un reintento apretado de más.
-- ───────────────────────────────────────────────────────────────
create function public.tomar_turno_cae(
  p_comprobante_id uuid,
  p_ficha          uuid,
  p_hasta          timestamptz
)
returns table (tomado boolean, ocupado_por uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pv   uuid;
  v_tipo smallint;
  v_mia  uuid;
begin
  select c.punto_venta_id, c.tipo_comprobante_id into v_pv, v_tipo
  from public.comprobante c
  where c.id = p_comprobante_id;
  if v_pv is null then
    raise exception 'El comprobante no existe.';
  end if;

  insert into public.turno_pedido_cae as t
    (punto_venta_id, tipo_comprobante_id, comprobante_id, ficha, hasta, tomado_en)
  values (v_pv, v_tipo, p_comprobante_id, p_ficha, p_hasta, now())
  on conflict (punto_venta_id, tipo_comprobante_id) do update
    set comprobante_id = excluded.comprobante_id,
        ficha          = excluded.ficha,
        hasta          = excluded.hasta,
        tomado_en      = excluded.tomado_en
    where t.hasta < now()
  returning t.ficha into v_mia;

  if v_mia = p_ficha then
    tomado      := true;
    ocupado_por := null;
  else
    tomado := false;
    select t.comprobante_id into ocupado_por
    from public.turno_pedido_cae t
    where t.punto_venta_id = v_pv and t.tipo_comprobante_id = v_tipo;
  end if;
  return next;
end;
$$;

comment on function public.tomar_turno_cae(uuid, uuid, timestamptz) is
  'Toma el turno para pedir un CAE en la serie del comprobante, si está libre o venció. Devuelve si se tomó y, si no, para qué comprobante está tomado.';

-- ───────────────────────────────────────────────────────────────
-- Soltarlo
--
-- Sólo con la misma ficha: si el turno ya venció y lo tomó otro, un
-- pedido que termina tarde no tiene que soltarle el turno al de ahora.
-- ───────────────────────────────────────────────────────────────
create function public.soltar_turno_cae(p_ficha uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.turno_pedido_cae where ficha = p_ficha;
$$;

comment on function public.soltar_turno_cae(uuid) is
  'Suelta el turno de pedir CAE que tomó esta ficha. Si ya no es suyo, no hace nada.';

revoke execute on function public.tomar_turno_cae(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.soltar_turno_cae(uuid) from public, anon, authenticated;
grant execute on function public.tomar_turno_cae(uuid, uuid, timestamptz) to service_role;
grant execute on function public.soltar_turno_cae(uuid) to service_role;
