-- ═══════════════════════════════════════════════════════════════
-- CARGAR UNA FACTURA DE COMPRA, DE UNA SOLA VEZ
--
-- Una factura son tres cosas: la cabecera, el desglose por alícuota y
-- las percepciones. Si se mandaran en tres viajes desde la pantalla y
-- fallara el segundo, quedaría una factura cargada con cero de IVA — y
-- eso no se nota mirando la lista, se nota meses después.
--
-- Es la misma disciplina que la devolución con nota de crédito, que hace
-- sus tres pasos adentro de una transacción.
--
-- Va como security invoker a propósito: las políticas de la tabla ya
-- dicen quién puede registrar compras ('compras.registrar'), y una
-- función que las esquivara sería una puerta de atrás a la misma tabla.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.registrar_compra(
  p_proveedor_id        uuid,
  p_tipo_comprobante_id smallint,
  p_punto_venta         integer,
  p_numero              bigint,
  p_fecha               date,
  p_neto_no_gravado     numeric default 0,
  p_exento              numeric default 0,
  p_observaciones       text    default null,
  p_alicuotas           jsonb   default '[]'::jsonb,
  p_tributos            jsonb   default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    insert into public.compra (
      proveedor_id, tipo_comprobante_id, punto_venta, numero, fecha,
      neto_no_gravado, exento, observaciones, cargada_por
    )
    values (
      p_proveedor_id, p_tipo_comprobante_id, p_punto_venta, p_numero, p_fecha,
      coalesce(p_neto_no_gravado, 0), coalesce(p_exento, 0),
      nullif(btrim(coalesce(p_observaciones, '')), ''),
      (select app.usuario_actual_id())
    )
    returning id into v_id;
  exception when unique_violation then
    -- El mensaje tiene que decir cuál, porque quien la está cargando
    -- tiene el papel en la mano y necesita saber si es esa misma.
    raise exception 'Esa factura ya está cargada: %-%.',
      lpad(p_punto_venta::text, 4, '0'), lpad(p_numero::text, 8, '0');
  end;

  insert into public.compra_alicuota (compra_id, alicuota_iva_id, base_imponible, importe)
  select
    v_id,
    (x->>'alicuota_iva_id')::smallint,
    (x->>'base_imponible')::numeric,
    (x->>'importe')::numeric
  from jsonb_array_elements(coalesce(p_alicuotas, '[]'::jsonb)) x;

  insert into public.compra_tributo (compra_id, descripcion, base_imponible, alicuota, importe)
  select
    v_id,
    x->>'descripcion',
    coalesce((x->>'base_imponible')::numeric, 0),
    (x->>'alicuota')::numeric,
    (x->>'importe')::numeric
  from jsonb_array_elements(coalesce(p_tributos, '[]'::jsonb)) x;

  return v_id;
end;
$$;

comment on function public.registrar_compra is
  'Carga una factura de compra entera —cabecera, alícuotas y percepciones— en una sola transacción. Los totales los calculan los disparadores desde el detalle.';

grant execute on function public.registrar_compra(
  uuid, smallint, integer, bigint, date, numeric, numeric, text, jsonb, jsonb
) to authenticated;

/*
  Dar de baja una factura cargada mal.

  Baja lógica y con motivo obligatorio, como todo lo que documenta plata:
  una compra que desaparece sin dejar rastro es una diferencia que
  después alguien tiene que explicar. La factura sigue estando; deja de
  contar.
*/
create or replace function public.anular_compra(p_compra_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para dar de baja una factura de compra hay que decir por qué.';
  end if;

  update public.compra
     set eliminado_en  = now(),
         observaciones = btrim(coalesce(observaciones || ' · ', '') || 'Baja: ' || btrim(p_motivo))
   where id = p_compra_id
     and eliminado_en is null;

  if not found then
    raise exception 'Esa factura de compra no existe o ya estaba dada de baja.';
  end if;
end;
$$;

comment on function public.anular_compra is
  'Baja lógica de una factura de compra, con motivo obligatorio que queda escrito en la propia factura.';

grant execute on function public.anular_compra(uuid, text) to authenticated;
