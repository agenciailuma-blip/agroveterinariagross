-- ═══════════════════════════════════════════════════════════════
-- LOS IMPORTES SE ESCRIBEN EN CASTELLANO
--
-- Visto en pantalla el 28/09, el mismo día que se construyó la cuenta de
-- proveedores: el resumen decía «Transferencia 150,000.00». to_char con
-- G y D toma el separador del idioma del servidor, que es inglés, así
-- que la coma y el punto salían al revés. Un «1,500.00» leído en Oberá
-- es mil quinientos o uno y medio según quién lo lea.
--
-- Un solo lugar que escribe pesos, y lo usan el resumen y los mensajes
-- del pago.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.pesos(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p < 0 then '-' else '' end || '$ ' ||
         translate(to_char(abs(round(p, 2)), 'FM999,999,999,990.00'), ',.', '.,')
$$;

comment on function app.pesos is
  'Un importe como se escribe en Argentina: $ 1.234,56. No depende del idioma del servidor.';

grant execute on function app.pesos(numeric) to authenticated;

create or replace view public.vista_movimiento_proveedor
with (security_invoker = true) as
select v.proveedor_id, v.fecha, v.origen as tipo, v.id, v.descripcion,
       greatest(v.total, 0)  as debe,
       greatest(-v.total, 0) as haber,
       null::text            as detalle
from public.vista_pendiente_proveedor v
union all
select p.proveedor_id, p.fecha, 'pago', p.id,
       'Pago',
       0,
       p.importe,
       (select string_agg(
                 case m.medio
                   when 'efectivo'       then 'Efectivo'
                   when 'transferencia'  then 'Transferencia'
                   when 'cheque_propio'  then 'Cheque propio ' || coalesce(m.banco || ' ', '') || 'N° ' || m.numero
                                              || ' al ' || to_char(m.fecha_cobro, 'DD/MM/YYYY')
                   when 'cheque_tercero' then 'Cheque de tercero ' || coalesce(m.banco || ' ', '') || 'N° ' || m.numero
                                              || ' al ' || to_char(m.fecha_cobro, 'DD/MM/YYYY')
                   else 'Otro'
                 end || ' ' || app.pesos(m.importe)
                 || coalesce(' (' || m.referencia || ')', ''),
               ' · ' order by m.importe desc)
          from public.pago_proveedor_medio m where m.pago_id = p.id)
from public.pago_proveedor p
where p.anulado_en is null;

create or replace function public.registrar_pago_proveedor(
  p_proveedor_id  uuid,
  p_fecha         date,
  p_medios        jsonb,
  p_imputaciones  jsonb default '[]'::jsonb,
  p_observaciones text  default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_importe  numeric := 0;
  v_imputado numeric := 0;
  v_x        jsonb;
  v_origen   text;
  v_ref      uuid;
  v_monto    numeric;
  v_pend     public.vista_pendiente_proveedor;
begin
  if not app.tiene_permiso('proveedores.pagar') then
    raise exception 'No tenés permiso para registrar pagos a proveedores.';
  end if;

  if not exists (select 1 from public.proveedor where id = p_proveedor_id and eliminado_en is null) then
    raise exception 'Ese proveedor no existe o está dado de baja.';
  end if;

  if p_fecha is null or p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;

  select coalesce(sum((m->>'importe')::numeric), 0) into v_importe
  from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) m;

  select coalesce(sum((x->>'importe')::numeric), 0) into v_imputado
  from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) x;

  -- Sin plata puede haber pago: descontar una nota de crédito de una
  -- factura es imputar sin que salga nada. Lo que no puede es no haber
  -- ni plata ni imputaciones.
  if v_importe <= 0 and jsonb_array_length(coalesce(p_imputaciones, '[]'::jsonb)) = 0 then
    raise exception 'El pago no tiene importe.';
  end if;

  if round(v_imputado, 2) > round(v_importe, 2) then
    raise exception 'Se está imputando % y el pago es de %: sobran facturas o falta plata.',
      app.pesos(v_imputado), app.pesos(v_importe);
  end if;

  if round(v_imputado, 2) < 0 then
    raise exception 'Las notas de crédito elegidas suman más que las facturas: no hay nada que pagar.';
  end if;

  insert into public.pago_proveedor (proveedor_id, fecha, importe, observaciones, registrado_por)
  values (p_proveedor_id, p_fecha, round(v_importe, 2),
          nullif(btrim(coalesce(p_observaciones, '')), ''), app.usuario_actual_id())
  returning id into v_id;

  begin
    insert into public.pago_proveedor_medio (pago_id, medio, importe, banco, numero, fecha_cobro, referencia)
    select v_id, m->>'medio', round((m->>'importe')::numeric, 2),
           nullif(btrim(m->>'banco'), ''), nullif(btrim(m->>'numero'), ''),
           (m->>'fecha_cobro')::date, nullif(btrim(m->>'referencia'), '')
    from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) m;
  exception when check_violation then
    raise exception 'Un cheque necesita el número y la fecha de cobro.';
  end;

  for v_x in select * from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) loop
    v_origen := v_x->>'origen';
    v_ref    := (v_x->>'id')::uuid;
    v_monto  := round((v_x->>'importe')::numeric, 2);

    if v_monto = 0 then continue; end if;

    -- Se bloquea el comprobante: dos pagos a la vez a la misma factura
    -- podrían pasar los dos el control de lo pendiente.
    if v_origen = 'compra' then
      perform 1 from public.compra where id = v_ref for update;
    else
      perform 1 from public.proveedor_saldo_inicial where id = v_ref for update;
    end if;

    select * into v_pend from public.vista_pendiente_proveedor
    where id = v_ref and origen = v_origen and proveedor_id = p_proveedor_id;

    if v_pend.id is null then
      raise exception 'Uno de los comprobantes no es de este proveedor o ya no está vigente.';
    end if;

    -- El signo de la imputación es el del comprobante, y no puede pasar
    -- de lo que le falta.
    if sign(v_monto) <> sign(v_pend.pendiente) or abs(v_monto) > abs(v_pend.pendiente) then
      raise exception 'A % le quedan % por pagar, y se le quieren imputar %.',
        v_pend.descripcion, app.pesos(v_pend.pendiente), app.pesos(v_monto);
    end if;

    insert into public.pago_proveedor_imputacion (pago_id, compra_id, saldo_inicial_id, importe)
    values (v_id,
            case when v_origen = 'compra' then v_ref end,
            case when v_origen = 'saldo_inicial' then v_ref end,
            v_monto);
  end loop;

  return v_id;
end;
$$;
