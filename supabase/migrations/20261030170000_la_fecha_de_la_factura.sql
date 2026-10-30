-- ═══════════════════════════════════════════════════════════════
-- LA FECHA DE LA FACTURA NO PUEDE SER ANTERIOR A LA ÚLTIMA DE LA SERIE
--
-- ARCA no autoriza un comprobante con fecha anterior al último que
-- autorizó de ese punto de venta y tipo: contesta 10016, «el número o
-- fecha no se corresponde con el próximo a autorizar».
--
-- La factura nace con la fecha de la venta. Un pedido que entró anoche
-- y se factura hoy, después de otra venta de hoy, quedaba rechazado, y
-- reintentar daba lo mismo: la fecha sólo se corregía pasados los días
-- de tolerancia. Se vio el 30/10 con la Factura B 36 (WEB-000011), del
-- 29/10, pedida segundos después de la 35, del 30/10.
--
-- Ahora, antes de pedir el CAE, la fecha se adelanta hasta la última de
-- la serie. Cuenta lo que tiene CAE o CAEA, también lo anulado después:
-- ARCA lo autorizó igual. Lo rechazado no cuenta: ARCA nunca lo vio.
--
-- De paso, «hoy» es el de Oberá: de noche, current_date ya es mañana.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.alinear_numeracion_comprobante(
  p_comprobante_id uuid,
  p_ultimo_arca    bigint
)
returns table (numero bigint, fecha date, se_renumero boolean, se_corrigio_fecha boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_comp       public.comprobante;
  v_siguiente  bigint;
  v_tolerancia integer;
  v_fecha      date;
  v_libre      bigint;
  v_ocupante   uuid;
  v_tope       bigint;
  v_caea       bigint;
  v_hoy        date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_ultima     date;
begin
  select * into v_comp from public.comprobante c where c.id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_comp.estado not in ('pendiente', 'rechazado') then
    raise exception 'El comprobante esta % y no se puede renumerar.', v_comp.estado;
  end if;

  -- Lo emitido con CAEA ocupa lugar en la serie aunque ARCA no lo vea
  -- todavia. Los informados tambien: ahi ARCA ya los cuenta y el
  -- greatest() no cambia nada.
  select coalesce(max(c.numero), 0) into v_caea
  from public.comprobante c
  where c.punto_venta_id      = v_comp.punto_venta_id
    and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
    and c.modalidad           = 'caea'
    and c.estado              in ('contingencia', 'informado');

  v_siguiente := greatest(coalesce(p_ultimo_arca, 0), v_caea) + 1;
  v_tope      := v_siguiente;

  if v_siguiente <> v_comp.numero then
    select c.id into v_ocupante
    from public.comprobante c
    where c.punto_venta_id      = v_comp.punto_venta_id
      and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
      and c.numero              = v_siguiente
      and c.id                  <> p_comprobante_id
      and c.estado              <> 'anulado';

    if v_ocupante is not null then
      if exists (select 1 from public.comprobante c
                 where c.id = v_ocupante and c.estado not in ('pendiente', 'rechazado')) then
        raise exception 'El numero % ya lo tiene un comprobante autorizado. La numeracion local quedo adelantada respecto de ARCA.', v_siguiente;
      end if;

      select coalesce(max(c.numero), 0) + 1 into v_libre
      from public.comprobante c
      where c.punto_venta_id      = v_comp.punto_venta_id
        and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
        and c.estado              <> 'anulado';

      update public.comprobante set numero = v_libre where id = v_ocupante;
      v_tope := greatest(v_tope, v_libre);
    end if;
  end if;

  select coalesce((valor #>> '{}')::integer, 5) into v_tolerancia
  from public.configuracion where clave = 'arca.dias_tolerancia_cae';

  v_fecha := v_comp.fecha;
  if abs(v_hoy - v_comp.fecha) > coalesce(v_tolerancia, 5) then
    v_fecha := v_hoy;
  end if;

  select max(c.fecha) into v_ultima
  from public.comprobante c
  where c.punto_venta_id      = v_comp.punto_venta_id
    and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
    and c.cae                 is not null
    and c.id                  <> p_comprobante_id;

  -- greatest() ignora el null de una serie sin nada autorizado.
  v_fecha := greatest(v_fecha, v_ultima);

  update public.comprobante c
     set numero = v_siguiente,
         fecha  = v_fecha
   where c.id = p_comprobante_id;

  update public.secuencia_comprobante s
     set ultimo_numero   = greatest(s.ultimo_numero, v_tope),
         ultimo_arca     = p_ultimo_arca,
         sincronizado_en = now()
   where s.punto_venta_id      = v_comp.punto_venta_id
     and s.tipo_comprobante_id = v_comp.tipo_comprobante_id;

  numero            := v_siguiente;
  fecha             := v_fecha;
  se_renumero       := v_siguiente <> v_comp.numero;
  se_corrigio_fecha := v_fecha <> v_comp.fecha;
  return next;
end;
$$;

comment on function public.alinear_numeracion_comprobante(uuid, bigint) is
  'Alinea el número y la fecha con ARCA antes de pedir el CAE. Cuenta también lo emitido con CAEA sin informar: ARCA todavía no lo ve, pero ocupa lugar en la serie.';
