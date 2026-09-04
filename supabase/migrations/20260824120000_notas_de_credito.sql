-- ═══════════════════════════════════════════════════════════════
-- 030 — NOTAS DE CRÉDITO Y DEVOLUCIONES
--
-- Hasta ahora anular_venta() revertía lo comercial —reingresaba el
-- stock y compensaba la deuda— pero no emitía nada. Si la venta ya
-- estaba facturada, esa factura quedaba viva en ARCA: para el fisco se
-- vendió igual, y el IVA se sigue debiendo.
--
-- El contador lo dijo textual: "lo lógico es una nota de crédito (tener
-- presente que si la factura tuvo percepción de IIBB la nota de crédito
-- también debe tenerla)".
--
-- ── POR QUÉ VA TODO EN UNA SOLA FUNCIÓN ──
--
-- Devolver una venta son tres cosas: reingresar el stock, sacarle la
-- deuda al cliente y emitir la nota de crédito. Si se hicieran por
-- separado y fallara la del medio, quedaría mercadería reingresada sin
-- documento, o una nota de crédito de mercadería que nunca volvió.
-- Acá las tres pasan o no pasa ninguna.
--
-- Lo único que queda afuera es pedirle el CAE a ARCA, porque eso
-- depende de una red que se cae. La nota queda 'pendiente' y entra a la
-- misma cola que cualquier comprobante que espera autorización.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.anular_venta_con_nota_credito(
  p_venta_id uuid,
  p_motivo   text
)
returns uuid   -- id de la nota de crédito, o null si la venta no estaba facturada
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta      public.venta;
  v_original   public.comprobante;
  v_tipo_nc    smallint;
  v_clase      char(1);
  v_numero     bigint;
  v_nc_id      uuid;
  v_pv_numero  integer;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la anulacion.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;

  -- Primero lo comercial. Si la venta ya estaba anulada, esto corta.
  perform public.anular_venta(p_venta_id, p_motivo);

  -- ── ¿Estaba facturada? ──
  select * into v_original
  from public.comprobante
  where venta_id = p_venta_id and estado in ('autorizado', 'informado', 'contingencia')
  order by creado_en desc
  limit 1;

  if v_original.id is null then
    -- Sin factura autorizada no hay nada que anular ante ARCA. Puede
    -- ser una venta que nunca se facturó, o cuyo comprobante todavía
    -- estaba pendiente: en ese caso se marca anulado y listo.
    update public.comprobante
       set estado = 'anulado'
     where venta_id = p_venta_id and estado in ('pendiente', 'rechazado');
    return null;
  end if;

  if exists (
    select 1 from public.comprobante_asociado ca
    join public.comprobante c on c.id = ca.comprobante_id
    where ca.asociado_id = v_original.id and c.estado <> 'anulado'
  ) then
    raise exception 'Esa factura ya tiene una nota de credito.';
  end if;

  -- Nota de crédito de la misma clase que la factura: A → 3, B → 8.
  select tc.clase into v_clase
  from public.tipo_comprobante tc where tc.id = v_original.tipo_comprobante_id;

  select tc.id into v_tipo_nc
  from public.tipo_comprobante tc
  where tc.clase = v_clase and tc.familia = 'nota_credito' and tc.activo;

  if v_tipo_nc is null then
    raise exception 'No hay tipo de nota de credito activo para comprobantes clase %.', v_clase;
  end if;

  v_numero := app.siguiente_numero_comprobante(v_original.punto_venta_id, v_tipo_nc);

  /*
    La nota copia los importes de la factura, percepción incluida.
    Lleva la fecha de HOY, no la de la factura: es un hecho nuevo, y
    ARCA valida la fecha contra el momento de emisión.
  */
  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
    moneda, cotizacion, estado, usuario_id
  ) values (
    v_tipo_nc, v_original.punto_venta_id, v_numero, p_venta_id, v_original.cliente_id,
    v_original.receptor_nombre, v_original.receptor_tipo_documento_id, v_original.receptor_documento,
    v_original.receptor_condicion_iva_id, v_original.receptor_domicilio,
    current_date, v_original.concepto,
    v_original.neto_gravado, v_original.neto_no_gravado, v_original.exento,
    v_original.iva_total, v_original.tributos_total, v_original.total,
    v_original.moneda, v_original.cotizacion, 'pendiente',
    app.usuario_actual_id()
  ) returning id into v_nc_id;

  -- Mismo desglose de IVA que la factura.
  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_nc_id, ca.alicuota_iva_id, ca.base_imponible, ca.importe
  from public.comprobante_alicuota ca
  where ca.comprobante_id = v_original.id;

  -- Y los mismos tributos: si la factura percibió IIBB, la nota lo
  -- devuelve. Sin esto, Gross le habría cobrado al cliente una
  -- percepción por una venta que no existió.
  insert into public.comprobante_tributo
    (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
  select v_nc_id, ct.tributo_id, ct.descripcion, ct.base_imponible, ct.alicuota, ct.importe
  from public.comprobante_tributo ct
  where ct.comprobante_id = v_original.id;

  -- El motivo no se copia acá: anular_venta() ya lo dejó en
  -- venta.motivo_anulacion, y un dato en dos lugares es un dato que
  -- algún día va a estar distinto en cada uno.
  --
  -- El vínculo con la factura. ARCA lo exige en el comprobante asociado
  -- de toda nota de crédito.
  select pv.numero into v_pv_numero
  from public.punto_venta pv where pv.id = v_original.punto_venta_id;

  insert into public.comprobante_asociado
    (comprobante_id, asociado_id, tipo_comprobante_id, punto_venta_numero, numero, fecha)
  values
    (v_nc_id, v_original.id, v_original.tipo_comprobante_id, v_pv_numero,
     v_original.numero, v_original.fecha);

  return v_nc_id;
end;
$$;

comment on function public.anular_venta_con_nota_credito(uuid, text) is
  'Anula una venta y, si estaba facturada, arma la nota de crédito que la cancela ante ARCA: mismos importes, mismo desglose de IVA y los mismos tributos (la percepción de IIBB incluida). Todo en una transacción. La nota queda pendiente de CAE.';

grant execute on function public.anular_venta_con_nota_credito(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Los comprobantes asociados, para armar el pedido a ARCA
-- ───────────────────────────────────────────────────────────────
create or replace view public.vista_comprobante_asociado
with (security_invoker = true) as
select
  ca.comprobante_id,
  ca.tipo_comprobante_id,
  ca.punto_venta_numero,
  ca.numero,
  ca.fecha
from public.comprobante_asociado ca;

comment on view public.vista_comprobante_asociado is
  'Comprobantes asociados de una nota de crédito o débito, con los datos que ARCA pide en CbtesAsoc.';

grant select on public.vista_comprobante_asociado to authenticated;

-- ───────────────────────────────────────────────────────────────
-- La vista de comprobantes suma dos datos que la pantalla necesita
-- para ofrecer la devolución sin equivocarse:
--
--   venta_id            → a qué venta devolverle el stock y la plata
--   familia             → para no ofrecer "devolver" sobre una nota
--   tiene_nota_credito  → para no devolver dos veces la misma factura
--
-- Se recrea entera (drop + create) porque agregar una columna en el
-- medio no se puede hacer con CREATE OR REPLACE VIEW.
-- ───────────────────────────────────────────────────────────────
drop view if exists public.vista_comprobante_estado;

create view public.vista_comprobante_estado
with (security_invoker = true) as
select
  c.id,
  c.venta_id,
  c.estado,
  c.modalidad,
  tc.descripcion            as tipo,
  tc.familia,
  pv.numero                 as punto_venta,
  c.numero,
  lpad(pv.numero::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0') as comprobante,
  c.fecha,
  c.receptor_nombre,
  c.total,
  c.cae,
  c.cae_vencimiento,
  c.impresiones,
  current_date - c.fecha    as dias_desde_emision,
  case
    when c.estado = 'autorizado'   and c.impresiones > 0 then 'verde'
    when c.estado = 'autorizado'   and c.impresiones = 0 then 'amarillo'
    when c.estado = 'pendiente'                          then 'naranja'
    when c.estado = 'rechazado'                          then 'rojo'
    when c.estado = 'contingencia'                       then 'violeta'
    when c.estado = 'informado'                          then 'verde'
    else 'gris'
  end                       as semaforo,
  case
    when c.estado not in ('pendiente', 'rechazado') then null
    when current_date - c.fecha > 5  then 'vencido'
    when current_date - c.fecha >= 4 then 'urgente'
    when current_date - c.fecha >= 2 then 'atencion'
    else 'en_plazo'
  end                       as ventana_cae,
  (select count(*) from public.intento_arca i
    where i.comprobante_id = c.id and i.resultado <> 'ok') as intentos_fallidos,
  (select max(i.creado_en) from public.intento_arca i
    where i.comprobante_id = c.id)                         as ultimo_intento,
  exists (
    select 1 from public.comprobante_asociado ca
    join public.comprobante nc on nc.id = ca.comprobante_id
    where ca.asociado_id = c.id and nc.estado <> 'anulado'
  )                         as tiene_nota_credito
from public.comprobante c
join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
join public.punto_venta pv      on pv.id = c.punto_venta_id;

comment on view public.vista_comprobante_estado is
  'Estado operativo de los comprobantes con semáforo. ventana_cae avisa cuando se agota el plazo de 5 días para pedir el CAE. tiene_nota_credito evita ofrecer devolver dos veces la misma factura.';

grant select on public.vista_comprobante_estado to authenticated;
