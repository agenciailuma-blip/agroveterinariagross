-- ═══════════════════════════════════════════════════════════════
-- 026 — CÁLCULO DE LA PERCEPCIÓN DE IIBB
--
-- La migración 023 dejó la alícuota y el mínimo configurables, pero el
-- cálculo quedó pendiente porque el servicio de facturación todavía no
-- existía. Ya existe y emite CAE, así que sin esto toda Factura A
-- saldría sin la percepción que Gross está obligado a percibir como
-- agente de la DGR Misiones (régimen 14).
--
-- LA REGLA, tal como la fijaron el contador y Lucas:
--   · Solo Factura A, es decir receptor Responsable Inscripto.
--   · Salvo que el cliente tenga certificado de exclusión vigente.
--   · No se practica si el importe de la percepción calculada —no el
--     de la venta— no supera el mínimo configurado.
--
-- ⚠️ BASE DE CÁLCULO: se toma el NETO GRAVADO TOTAL (la suma de las
-- bases imponibles de todas las alícuotas). Es la lectura estándar,
-- pero el ejemplo que mandó el contador es ambiguo: en su planilla la
-- percepción da 3,31 sobre un neto total de 150, que es 3,31% de 100
-- —justo la base del renglón al 21%— y pone 0,00 en el renglón al
-- 10,5%. Puede ser que los productos con IVA reducido queden fuera de
-- la percepción, o puede ser que haya volcado el total en el primer
-- renglón porque su planilla es un desglose por alícuota y la
-- percepción es una sola por comprobante.
-- Está anotado como consulta pendiente en docs/ESTADO.md. Si la
-- respuesta es que el IVA reducido queda excluido, se cambia la base
-- en esta función y nada más.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.calcular_percepcion_iibb(
  p_cliente_id uuid,
  p_base       numeric
)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_condicion  smallint;
  v_excluido   boolean;
  v_alicuota   numeric;
  v_minimo     numeric;
  v_percepcion numeric;
begin
  if p_cliente_id is null or coalesce(p_base, 0) <= 0 then
    return 0;
  end if;

  select c.condicion_iva_id, c.iibb_percepcion_excluido
    into v_condicion, v_excluido
  from public.cliente c
  where c.id = p_cliente_id;

  -- Condición 1 = IVA Responsable Inscripto, que es a quien se le
  -- emite Factura A. Al resto no se le percibe.
  if v_condicion is distinct from 1 then
    return 0;
  end if;

  if coalesce(v_excluido, false) then
    return 0;
  end if;

  select (valor #>> '{}')::numeric into v_alicuota
  from public.configuracion where clave = 'arca.iibb_percepcion_alicuota';

  select (valor #>> '{}')::numeric into v_minimo
  from public.configuracion where clave = 'arca.iibb_percepcion_minimo';

  if coalesce(v_alicuota, 0) <= 0 then
    return 0;
  end if;

  v_percepcion := round(p_base * v_alicuota / 100, 2);

  -- El mínimo se compara contra la percepción, no contra la venta.
  -- Así lo puso el contador por escrito, y es la diferencia entre
  -- percibirle a una venta de $30.000 o a una de $725.000.
  if v_percepcion <= coalesce(v_minimo, 0) then
    return 0;
  end if;

  return v_percepcion;
end;
$$;

comment on function public.calcular_percepcion_iibb(uuid, numeric) is
  'Percepción de IIBB Misiones (régimen 14) para un cliente y una base gravada. Devuelve 0 si no corresponde: receptor que no es Responsable Inscripto, cliente con certificado de exclusión, o percepción por debajo del mínimo configurado.';

grant execute on function public.calcular_percepcion_iibb(uuid, numeric) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- preparar_comprobante(): mismo armado de antes, más la percepción.
--
-- Cambia el total: pasa a ser neto + IVA + percepción, que es lo que
-- el receptor debe. Si la percepción da 0 —el caso habitual, porque el
-- mínimo es alto— el total queda igual que la venta, como hasta ahora.
-- ───────────────────────────────────────────────────────────────
create or replace function public.preparar_comprobante(
  p_venta_id       uuid,
  p_punto_venta_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta      public.venta;
  v_cliente    public.cliente;
  v_clase      char(1);
  v_tipo       smallint;
  v_pv         uuid;
  v_numero     bigint;
  v_comp_id    uuid;
  v_neto       numeric := 0;
  v_iva        numeric := 0;
  v_exento     numeric := 0;
  v_percepcion numeric := 0;
  v_alicuota   numeric := 0;
begin
  select * into v_venta from public.venta where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se factura una venta cobrada. Esta esta %.', v_venta.estado;
  end if;
  if exists (select 1 from public.comprobante
             where venta_id = p_venta_id and estado <> 'anulado') then
    raise exception 'La venta ya tiene un comprobante emitido.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  -- A un Responsable Inscripto le corresponde A; al resto B
  v_clase := public.tipo_comprobante_para(v_venta.cliente_id);
  select id into v_tipo from public.tipo_comprobante
  where clase = v_clase and familia = 'factura' and activo;

  -- Punto de venta: el explicito, o el de la caja donde se cobro
  v_pv := p_punto_venta_id;
  if v_pv is null then
    select t.punto_venta_id into v_pv
    from public.caja c join public.terminal t on t.id = c.terminal_id
    where c.id = v_venta.caja_id;
  end if;
  if v_pv is null then
    select id into v_pv from public.punto_venta
    where activo and not es_respaldo and eliminado_en is null
    order by numero limit 1;
  end if;
  if v_pv is null then
    raise exception 'No hay punto de venta configurado para facturar.';
  end if;

  v_numero := app.siguiente_numero_comprobante(v_pv, v_tipo);

  select
    coalesce(sum(neto), 0),
    coalesce(sum(iva), 0)
  into v_neto, v_iva
  from public.vista_venta_iva where venta_id = p_venta_id;

  select coalesce(sum(l.importe), 0) into v_exento
  from public.venta_linea l
  where l.venta_id = p_venta_id and l.condicion_iva = 'exento';

  -- Percepción de IIBB sobre el neto gravado (ver comentario de arriba)
  v_percepcion := public.calcular_percepcion_iibb(v_cliente.id, v_neto);
  if v_percepcion > 0 then
    select (valor #>> '{}')::numeric into v_alicuota
    from public.configuracion where clave = 'arca.iibb_percepcion_alicuota';
  end if;

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, exento, iva_total, tributos_total, total,
    estado, usuario_id, terminal_id
  ) values (
    v_tipo, v_pv, v_numero, p_venta_id, v_cliente.id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.localidad)), ''),
    v_venta.ocurrido_en::date, 1,
    v_neto, v_exento, v_iva, v_percepcion, v_venta.total + v_percepcion,
    'pendiente', v_venta.cajero_id, v_venta.terminal_origen_id
  ) returning id into v_comp_id;

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_comp_id, alicuota_iva_id, neto, iva
  from public.vista_venta_iva where venta_id = p_venta_id;

  -- Tributo 2 = Impuestos provinciales, el código de ARCA para IIBB.
  if v_percepcion > 0 then
    insert into public.comprobante_tributo
      (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
    values
      (v_comp_id, 2, 'Percepción IIBB Misiones', v_neto, v_alicuota, v_percepcion);
  end if;

  return v_comp_id;
end;
$$;

comment on function public.preparar_comprobante(uuid, uuid) is
  'Arma el comprobante desde una venta cobrada: reserva número, copia los datos del receptor, calcula el desglose de IVA y la percepción de IIBB si corresponde. Deja el pedido de CAE al servicio que habla con ARCA.';

grant execute on function public.preparar_comprobante(uuid, uuid) to authenticated;
