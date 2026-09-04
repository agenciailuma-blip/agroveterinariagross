-- ═══════════════════════════════════════════════════════════════
-- ELEGIR LA DOCUMENTACION ANTES DE COBRAR
--
-- Punto 20 de las sugerencias de Lucas: "antes de cobrar, marcar si es
-- factura (arca) o proforma". La columna venta.documentacion ya existe;
-- esto es el camino para escribirla, con sus dos candados.
--
-- POR QUE UNA FUNCION Y NO UN UPDATE DESDE LA PANTALLA
--
-- Las dos reglas que gobiernan esta decision no pueden vivir en el
-- navegador, porque un navegador con la consola abierta las saltea:
--
-- 1) HACE FALTA UN PERMISO PROPIO. Emitir un presupuesto o un remito es
--    operacion diaria de cualquier cajero. Decidir que una venta no
--    lleve factura es una decision del duenio. Por eso
--    facturacion.vender_sin_factura existe aparte y no se lo damos ni al
--    Cajero ni al Vendedor.
--
-- 2) A UN RESPONSABLE INSCRIPTO NO SE LE ENTREGA OTRA COSA. Un RI compra
--    para descargar el IVA; entregarle un comprobante interno en vez de
--    la Factura A es un problema para el cliente, no una preferencia de
--    Gross. La base lo rechaza.
--
-- Y SOLO ANTES DE COBRAR. Una vez cobrada, la venta ya emitio (o no) su
-- documento: cambiar la marca despues seria decir que paso algo distinto
-- de lo que efectivamente paso. Es la misma linea de siempre — el
-- sistema registra la realidad, no la reescribe.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.marcar_documentacion_venta(
  p_venta_id      uuid,
  p_documentacion text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta   public.venta;
  v_cliente public.cliente;
begin
  if p_documentacion not in ('fiscal', 'no_fiscal') then
    raise exception 'Documentacion invalida: "%". Solo fiscal o no_fiscal.', p_documentacion;
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % : la documentacion se elige antes de cobrar.', v_venta.estado;
  end if;

  if p_documentacion = 'no_fiscal' then
    if not app.tiene_permiso('facturacion.vender_sin_factura') then
      raise exception 'No tenes permiso para cobrar una venta sin factura.';
    end if;

    select * into v_cliente from public.cliente where id = v_venta.cliente_id;
    if v_cliente.condicion_iva_id = 1 then
      raise exception
        'A % (Responsable Inscripto) le corresponde Factura A: no se puede cobrar sin factura.',
        v_cliente.nombre;
    end if;
  end if;

  update public.venta
  set documentacion = p_documentacion
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

comment on function public.marcar_documentacion_venta(uuid, text) is
  'Marca si la venta se cobra con factura de ARCA o con comprobante no fiscal. Exige permiso propio y rechaza al Responsable Inscripto. Solo antes de cobrar.';

grant execute on function public.marcar_documentacion_venta(uuid, text) to authenticated;
