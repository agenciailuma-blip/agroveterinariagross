-- ═══════════════════════════════════════════════════════════════
-- 018 — COBRANZA DE CUENTA CORRIENTE
--
-- Un cliente que viene a pagar la cuenta pone plata en el cajón. Si el
-- sistema sólo baja la deuda y no registra el ingreso, al cerrar el
-- turno sobra efectivo y nadie sabe de dónde salió. Con el tiempo eso
-- entrena a la gente a ignorar las diferencias de arqueo, que es
-- exactamente lo que un arqueo tiene que evitar.
--
-- Por eso las dos cosas pasan juntas o no pasa ninguna: baja la deuda y
-- entra a la caja, en una sola transacción.
--
-- Sólo entra a la caja si el medio de pago mueve efectivo. Una
-- transferencia baja la deuda pero no toca el cajón.
--
-- La cobranza se imputa al saldo, no a comprobantes puntuales. Es como
-- se maneja una cuenta corriente de mostrador: el cliente paga lo que
-- puede y se descuenta de lo más viejo. La imputación uno a uno se puede
-- agregar después sin tocar nada de esto.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.registrar_cobranza(
  p_cliente_id    uuid,
  p_importe       numeric,
  p_medio_pago_id uuid,
  p_caja_id       uuid default null,
  p_concepto      text default null,
  p_usuario_id    uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cliente     public.cliente;
  v_medio       public.medio_pago;
  v_usuario     uuid;
  v_movimiento  uuid;
  v_estado_caja text;
begin
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe de la cobranza tiene que ser mayor que cero.';
  end if;

  select * into v_cliente from public.cliente
  where id = p_cliente_id and eliminado_en is null;

  if v_cliente.id is null then
    raise exception 'El cliente no existe.';
  end if;
  if not v_cliente.cuenta_corriente then
    raise exception 'El cliente % no tiene cuenta corriente habilitada.', v_cliente.nombre;
  end if;

  select * into v_medio from public.medio_pago
  where id = p_medio_pago_id and eliminado_en is null and activo;

  if v_medio.id is null then
    raise exception 'El medio de pago no existe o esta inactivo.';
  end if;
  if v_medio.tipo = 'cuenta_corriente' then
    raise exception 'No se puede cobrar una cuenta corriente con cuenta corriente.';
  end if;

  v_usuario := coalesce(p_usuario_id, app.usuario_actual_id());

  insert into public.movimiento_cuenta_corriente
    (cliente_id, tipo, importe, concepto, referencia_tipo, usuario_id, operador_id)
  values
    (p_cliente_id, 'cobranza', -p_importe,
     coalesce(nullif(trim(p_concepto), ''), 'Cobranza en ' || v_medio.nombre),
     'recibo', v_usuario, v_usuario)
  returning id into v_movimiento;

  -- Al cajón sólo lo que efectivamente entra al cajón.
  if v_medio.afecta_caja then
    if p_caja_id is null then
      raise exception 'Cobrar en % necesita una caja abierta: si no, el dinero entra y el arqueo no lo ve.',
        v_medio.nombre;
    end if;

    select estado into v_estado_caja from public.caja where id = p_caja_id;
    if v_estado_caja is null then
      raise exception 'La caja indicada no existe.';
    end if;
    if v_estado_caja <> 'abierta' then
      raise exception 'La caja esta cerrada.';
    end if;

    insert into public.caja_movimiento (caja_id, tipo, importe, concepto, usuario_id)
    values (p_caja_id, 'ingreso', p_importe,
            'Cobranza cuenta corriente — ' || v_cliente.nombre, v_usuario);
  end if;

  return v_movimiento;
end;
$$;

comment on function public.registrar_cobranza(uuid, numeric, uuid, uuid, text, uuid) is
  'Registra el pago de una cuenta corriente. Baja la deuda y, si el medio mueve efectivo, lo ingresa a la caja en la misma transaccion.';

grant execute on function public.registrar_cobranza(uuid, numeric, uuid, uuid, text, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Resumen de deuda por antigüedad
--
-- El listado de cobranzas necesita saber cuánto hace que vencio cada
-- deuda, no sólo cuánto se debe. Un saldo de cien mil vencido hace tres
-- meses no es lo mismo que uno vencido ayer.
-- ───────────────────────────────────────────────────────────────
create view public.vista_deuda_antiguedad
with (security_invoker = true) as
select
  cl.id                                  as cliente_id,
  cl.nombre,
  cl.telefono,
  coalesce(s.saldo, 0)                   as saldo,
  cl.limite_credito,
  coalesce(sum(m.importe) filter (
    where m.vencimiento >= current_date), 0)                        as por_vencer,
  coalesce(sum(m.importe) filter (
    where m.vencimiento < current_date
      and m.vencimiento >= current_date - 30), 0)                   as vencido_30,
  coalesce(sum(m.importe) filter (
    where m.vencimiento < current_date - 30
      and m.vencimiento >= current_date - 60), 0)                   as vencido_60,
  coalesce(sum(m.importe) filter (
    where m.vencimiento < current_date - 60), 0)                    as vencido_mas_60,
  min(m.vencimiento) filter (where m.vencimiento < current_date)    as vencimiento_mas_antiguo
from public.cliente cl
left join public.cuenta_corriente_saldo s on s.cliente_id = cl.id
left join public.movimiento_cuenta_corriente m
       on m.cliente_id = cl.id and m.importe > 0 and m.vencimiento is not null
where cl.eliminado_en is null and cl.cuenta_corriente
group by cl.id, cl.nombre, cl.telefono, s.saldo, cl.limite_credito;

comment on view public.vista_deuda_antiguedad is
  'Deuda abierta por tramos de antiguedad. Base del listado de cobranzas y del calendario de recibos.';

grant select on public.vista_deuda_antiguedad to authenticated;
