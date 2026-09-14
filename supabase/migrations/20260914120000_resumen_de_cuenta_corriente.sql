-- ═══════════════════════════════════════════════════════════════
-- EL RESUMEN DE CUENTA CORRIENTE
--
-- Pedido de Lucas, 14/09: «un documento que yo descargo del sistema
-- donde indica todos los pagos, los ingresos, la nota de crédito, las
-- facturas». Es lo que manda a fin de mes al cliente que no pagó.
--
-- ─── TIENE LA FORMA DE UN RESUMEN BANCARIO, A PROPÓSITO ───
--
-- Saldo anterior, los movimientos del período con el saldo que va
-- quedando después de cada uno, y el saldo al cierre. Es la forma que el
-- cliente ya sabe leer, y la que le permite a cualquiera rehacer la
-- cuenta con una calculadora: el saldo anterior más los cargos menos los
-- pagos tiene que dar el saldo final. Un resumen que no se puede
-- verificar a mano es un resumen que se discute.
--
-- ─── EL SALDO ANTERIOR SALE DE LA BASE, NO DE LA PANTALLA ───
--
-- La lista de movimientos de la ficha del cliente trae los últimos 200.
-- Un cliente con historia larga tiene más, y un saldo anterior sumado
-- sobre una lista cortada daría mal sin avisar. Acá se suma todo lo que
-- ocurrió antes del período, sin límite.
--
-- ─── LOS DÍAS SON LOS DE OBERÁ ───
--
-- Por lo mismo que en las métricas: el servidor vive en UTC, y una
-- cobranza hecha el 31 a las diez de la noche caería en el mes siguiente
-- y aparecería en el resumen equivocado.
--
-- ─── RESPETA QUIÉN CONSULTA ───
--
-- La función es security invoker: lee la cuenta corriente con los
-- permisos de quien la llama. Sin `cuentacorriente.ver` los movimientos
-- vienen vacíos, igual que en cualquier otra pantalla.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.resumen_cuenta_corriente(
  p_cliente_id uuid,
  p_desde      date,
  p_hasta      date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_inicio   timestamptz;
  v_fin      timestamptz;
  v_anterior numeric;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_cliente  jsonb;
  v_movs     jsonb;
  v_totales  record;
  v_deuda    record;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Hay que indicar desde y hasta que fecha.';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha desde no puede ser posterior a la fecha hasta.';
  end if;

  v_inicio := p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_fin    := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  select jsonb_build_object(
           'id', cl.id,
           'codigo', cl.codigo,
           'nombre', cl.nombre,
           'documento_sigla', td.sigla,
           'documento', cl.numero_documento,
           'condicion_iva', ci.descripcion,
           'domicilio', nullif(trim(concat_ws(' ', cl.calle, cl.numero, cl.piso_depto)), ''),
           'localidad', nullif(trim(concat_ws(', ', cl.localidad, cl.provincia)), ''),
           'telefono', cl.telefono,
           'email', cl.email,
           'limite_credito', cl.limite_credito)
    into v_cliente
    from public.cliente cl
    left join public.tipo_documento td on td.id = cl.tipo_documento_id
    left join public.condicion_iva_receptor ci on ci.id = cl.condicion_iva_id
   where cl.id = p_cliente_id;

  if v_cliente is null then
    raise exception 'El cliente no existe.';
  end if;

  select coalesce(sum(m.importe), 0) into v_anterior
    from public.movimiento_cuenta_corriente m
   where m.cliente_id = p_cliente_id and m.ocurrido_en < v_inicio;

  /*
    Los movimientos, con el saldo que deja cada uno.

    El orden desempata por creado_en y por id: dos movimientos cargados
    en el mismo instante —una venta y su cobranza parcial— tienen que
    salir siempre en el mismo orden, o el saldo intermedio de la hoja
    cambiaría cada vez que se imprime.
  */
  select coalesce(jsonb_agg(t order by t.orden), '[]'::jsonb) into v_movs
    from (
      select
        row_number() over w as orden,
        (m.ocurrido_en at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
        m.tipo,
        m.concepto,
        m.vencimiento,
        case when m.importe > 0 then m.importe else 0 end as debe,
        case when m.importe < 0 then -m.importe else 0 end as haber,
        v_anterior + sum(m.importe) over w as saldo
      from public.movimiento_cuenta_corriente m
      where m.cliente_id = p_cliente_id
        and m.ocurrido_en >= v_inicio
        and m.ocurrido_en < v_fin
      window w as (order by m.ocurrido_en, m.creado_en, m.id
                   rows between unbounded preceding and current row)
    ) t;

  select coalesce(sum(case when m.importe > 0 then m.importe else 0 end), 0) as debe,
         coalesce(sum(case when m.importe < 0 then -m.importe else 0 end), 0) as haber
    into v_totales
    from public.movimiento_cuenta_corriente m
   where m.cliente_id = p_cliente_id
     and m.ocurrido_en >= v_inicio
     and m.ocurrido_en < v_fin;

  -- La deuda vencida es una foto de hoy: sólo tiene sentido en un resumen
  -- que llega hasta hoy. La pantalla decide si la muestra.
  select d.vencido_30 + d.vencido_60 + d.vencido_mas_60 as vencido,
         d.vencimiento_mas_antiguo
    into v_deuda
    from public.vista_deuda_antiguedad d
   where d.cliente_id = p_cliente_id;

  return jsonb_build_object(
    'cliente', v_cliente,
    'desde', p_desde,
    'hasta', p_hasta,
    'hoy', v_hoy,
    'saldo_anterior', v_anterior,
    'movimientos', v_movs,
    'total_debe', v_totales.debe,
    'total_haber', v_totales.haber,
    'saldo_final', v_anterior + v_totales.debe - v_totales.haber,
    'vencido_hoy', coalesce(v_deuda.vencido, 0),
    'vencimiento_mas_antiguo', v_deuda.vencimiento_mas_antiguo
  );
end;
$$;

comment on function public.resumen_cuenta_corriente(uuid, date, date) is
  'El resumen de cuenta corriente de un cliente para un período: saldo anterior, movimientos con saldo corrido y saldo al cierre, en días de Oberá. Es lo que Gross le manda al cliente a fin de mes.';

grant execute on function public.resumen_cuenta_corriente(uuid, date, date) to authenticated;
