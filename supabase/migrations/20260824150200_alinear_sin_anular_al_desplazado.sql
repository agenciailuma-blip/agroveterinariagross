-- Corrige alinear_numeracion_comprobante: el comprobante que ocupaba el
-- numero no se anula, se corre.
--
-- Anularlo era demasiado destructivo. Si hay tres comprobantes
-- esperando CAE, ARCA los autoriza de a uno y en orden: el que se pide
-- primero toma el numero que sigue, y los otros van despues. Anular a
-- los demas obligaba a rehacerlos, cuando lo unico que necesitan es
-- correrse un lugar.
--
-- Se los manda al final de la numeracion. Cuando llegue su turno, esta
-- misma funcion los va a traer al numero que corresponda.
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
begin
  select * into v_comp from public.comprobante c where c.id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_comp.estado not in ('pendiente', 'rechazado') then
    raise exception 'El comprobante esta % y no se puede renumerar.', v_comp.estado;
  end if;

  v_siguiente := coalesce(p_ultimo_arca, 0) + 1;

  if v_siguiente <> v_comp.numero then
    -- ¿Quien ocupa el numero que ARCA espera?
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

      -- Se lo corre al final, sin perderlo: sigue esperando su CAE.
      select coalesce(max(c.numero), 0) + 1 into v_libre
      from public.comprobante c
      where c.punto_venta_id      = v_comp.punto_venta_id
        and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
        and c.estado              <> 'anulado';

      update public.comprobante set numero = v_libre where id = v_ocupante;
    end if;
  end if;

  select coalesce((valor #>> '{}')::integer, 5) into v_tolerancia
  from public.configuracion where clave = 'arca.dias_tolerancia_cae';

  v_fecha := v_comp.fecha;
  if abs(current_date - v_comp.fecha) > coalesce(v_tolerancia, 5) then
    v_fecha := current_date;
  end if;

  update public.comprobante c
     set numero = v_siguiente,
         fecha  = v_fecha
   where c.id = p_comprobante_id;

  update public.secuencia_comprobante s
     set ultimo_numero   = greatest(s.ultimo_numero, v_siguiente),
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
  'Pone el comprobante en el numero que ARCA espera (ultimo autorizado + 1) y corrige la fecha si quedo fuera de la ventana que ARCA acepta. Al que ocupaba ese numero lo corre al final, sin anularlo.';
