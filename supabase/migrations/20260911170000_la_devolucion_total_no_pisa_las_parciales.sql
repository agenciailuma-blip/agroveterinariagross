-- ═══════════════════════════════════════════════════════════════
-- UNA VENTA CON DEVOLUCIONES PARCIALES YA NO SE ANULA ENTERA
--
-- `anular_venta` reingresa el stock mirando lo que salió por la venta, y
-- no descuenta lo que ya volvió por una devolución parcial: esos
-- movimientos van con referencia 'devolucion' y quedan fuera de su
-- cuenta. Anular una venta a la que ya le devolvieron una bolsa
-- reingresaría las tres, e inventaría stock que nunca existió.
--
-- Se corta acá y no en la pantalla. La pantalla esconde el botón, pero
-- esto es lo que de verdad protege el inventario: una llamada directa a
-- la función, o una pantalla desactualizada, tienen que chocar igual.
--
-- Lo que queda por devolver se devuelve con `devolver_lineas_de_venta`,
-- que sabe cuánto falta.
--
-- Verificado: con una devolución parcial de 1 de 2 unidades, el intento
-- de anular la venta entera se rechaza y el stock del producto queda con
-- el +1 que corresponde, no con +2.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.anular_venta_con_nota_credito(
  p_venta_id uuid,
  p_motivo   text
)
returns uuid
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

  -- Lo único que cambia respecto de la versión anterior.
  if exists (select 1 from public.devolucion where venta_id = p_venta_id) then
    raise exception 'Esta venta ya tiene devoluciones parciales: devolve lo que queda por partes, no la venta entera.';
  end if;

  perform public.anular_venta(p_venta_id, p_motivo);

  select * into v_original
  from public.comprobante
  where venta_id = p_venta_id and estado in ('autorizado', 'informado', 'contingencia')
  order by creado_en desc
  limit 1;

  if v_original.id is null then
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

  select tc.clase into v_clase
  from public.tipo_comprobante tc where tc.id = v_original.tipo_comprobante_id;

  select tc.id into v_tipo_nc
  from public.tipo_comprobante tc
  where tc.clase = v_clase and tc.familia = 'nota_credito' and tc.activo;

  if v_tipo_nc is null then
    raise exception 'No hay tipo de nota de credito activo para comprobantes clase %.', v_clase;
  end if;

  v_numero := app.siguiente_numero_comprobante(v_original.punto_venta_id, v_tipo_nc);

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

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_nc_id, ca.alicuota_iva_id, ca.base_imponible, ca.importe
  from public.comprobante_alicuota ca
  where ca.comprobante_id = v_original.id;

  insert into public.comprobante_tributo
    (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
  select v_nc_id, ct.tributo_id, ct.descripcion, ct.base_imponible, ct.alicuota, ct.importe
  from public.comprobante_tributo ct
  where ct.comprobante_id = v_original.id;

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
  'Anula una venta entera y, si estaba facturada, arma la nota de crédito que la cancela ante ARCA. Rechaza las ventas con devoluciones parciales: esas se siguen devolviendo por partes, porque reingresarían stock de más.';
