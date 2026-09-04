-- ═══════════════════════════════════════════════════════════════
-- 035 — EL CONTADOR MIRA LOS NUMEROS QUE EXISTEN DE VERDAD
--
-- Sintoma: "duplicate key value violates unique constraint
-- comprobante_numeracion_unica" al armar un comprobante.
--
-- El contador solo sumaba uno a su propio valor, sin mirar los
-- comprobantes. Alcanza con que alguien mueva un numero —la alineacion
-- con ARCA lo hace, y es su trabajo— para que el contador quede atras y
-- entregue un numero ya ocupado.
--
-- Ahora toma el mayor entre su valor y el ultimo numero realmente
-- usado. Asi no puede entregar un numero ocupado, sin importar como
-- haya quedado la numeracion.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.siguiente_numero_comprobante(
  p_punto_venta_id      uuid,
  p_tipo_comprobante_id smallint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usado  bigint;
  v_numero bigint;
begin
  -- El mayor numero que existe de verdad. Los anulados no cuentan:
  -- no llegaron a tener CAE y su numero se puede reutilizar.
  select coalesce(max(c.numero), 0) into v_usado
  from public.comprobante c
  where c.punto_venta_id      = p_punto_venta_id
    and c.tipo_comprobante_id = p_tipo_comprobante_id
    and c.estado              <> 'anulado';

  insert into public.secuencia_comprobante
    (punto_venta_id, tipo_comprobante_id, ultimo_numero, actualizado_en)
  values (p_punto_venta_id, p_tipo_comprobante_id, v_usado + 1, now())
  on conflict (punto_venta_id, tipo_comprobante_id) do update
    set ultimo_numero  = greatest(public.secuencia_comprobante.ultimo_numero, v_usado) + 1,
        actualizado_en = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function app.siguiente_numero_comprobante(uuid, smallint) is
  'Reserva el proximo numero de comprobante. Toma el mayor entre el contador y el ultimo numero realmente usado, para no entregar uno ocupado si la numeracion se movio.';

-- Y la alineacion adelanta el contador tambien cuando corre a otro
-- comprobante: si lo manda al 7 y el contador sigue en 6, el proximo
-- comprobante que se arme choca contra el.
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
begin
  select * into v_comp from public.comprobante c where c.id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_comp.estado not in ('pendiente', 'rechazado') then
    raise exception 'El comprobante esta % y no se puede renumerar.', v_comp.estado;
  end if;

  v_siguiente := coalesce(p_ultimo_arca, 0) + 1;
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
  if abs(current_date - v_comp.fecha) > coalesce(v_tolerancia, 5) then
    v_fecha := current_date;
  end if;

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
