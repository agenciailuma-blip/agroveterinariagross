-- ═══════════════════════════════════════════════════════════════
-- 033 — ALINEAR LA NUMERACION CON ARCA ANTES DE PEDIR EL CAE
--
-- ARCA rechaza (codigo 10016) todo comprobante que no sea el siguiente
-- al ultimo que autorizo. Basta que un pedido falle para que nuestro
-- contador y el de ARCA se separen, y a partir de ahi todo lo que sigue
-- se rechaza en cadena.
--
-- Ademas, el numero de un comprobante rechazado quedaba bloqueado para
-- siempre. Un comprobante sin CAE no existe para el fisco: su numero se
-- puede reutilizar, y por eso el indice unico ahora excluye los
-- anulados.
-- ═══════════════════════════════════════════════════════════════

alter table public.comprobante drop constraint if exists comprobante_numeracion_unica;

create unique index comprobante_numeracion_unica
  on public.comprobante (punto_venta_id, tipo_comprobante_id, numero)
  where estado <> 'anulado';

comment on index public.comprobante_numeracion_unica is
  'Numeracion unica por punto de venta y tipo. Excluye los anulados: un comprobante sin CAE no existe fiscalmente y su numero se puede reutilizar.';

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
    update public.comprobante c
       set estado = 'anulado'
     where c.punto_venta_id      = v_comp.punto_venta_id
       and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
       and c.numero              = v_siguiente
       and c.id                  <> p_comprobante_id
       and c.estado in ('pendiente', 'rechazado');

    if exists (select 1 from public.comprobante c
               where c.punto_venta_id      = v_comp.punto_venta_id
                 and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
                 and c.numero              = v_siguiente
                 and c.id                  <> p_comprobante_id
                 and c.estado              <> 'anulado') then
      raise exception 'El numero % ya lo tiene un comprobante autorizado. La numeracion local quedo adelantada respecto de ARCA.', v_siguiente;
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
  'Pone el comprobante en el numero que ARCA espera (ultimo autorizado + 1) y corrige la fecha si quedo fuera de la ventana que ARCA acepta. Anula los comprobantes sin CAE que ocupaban ese numero.';

grant execute on function public.alinear_numeracion_comprobante(uuid, bigint) to authenticated;
