-- ═══════════════════════════════════════════════════════════════
-- NOTAS DE CRÉDITO Y DÉBITO A MANO, Y EL RECIBO LIBRE
--
-- Pedido en la reunión del 19/11.
--
-- · Nota de crédito o de débito «libre»: se escribe renglón por renglón
--   (descripción, importe con IVA, alícuota), sin salir de una venta.
--   Asociada a una factura, o sin factura. Sin factura, ARCA pide el
--   período que abarca: lo arma la función que pide el CAE.
--   Mueve la cuenta corriente del cliente si la tiene habilitada (la
--   de crédito resta, la de débito suma). No toca stock: para que vuelva
--   mercadería sigue estando «Devolver».
--
-- · Recibo libre: para un pago que no es cobranza de cuenta corriente
--   (una operación de urgencia que se paga en partes, por ejemplo). El
--   cliente se elige de la lista o se escribe a mano. Numerado en la
--   misma serie que los demás recibos, la plata entra a la caja abierta
--   y no toca ninguna cuenta.
--
-- Sin percepción de IIBB en las notas a mano: van por lo que se
-- escribe, y nada más.
-- ═══════════════════════════════════════════════════════════════

-- ── Los renglones de una nota escrita a mano ────────────────────
--
-- Las facturas y las notas de una devolución toman sus renglones de la
-- venta. Una nota a mano no tiene venta: guarda los suyos acá.
create table public.comprobante_linea (
  id               uuid primary key default gen_random_uuid(),
  comprobante_id   uuid not null references public.comprobante(id) on delete cascade,
  orden            smallint not null,
  descripcion      text not null check (length(btrim(descripcion)) > 0),
  cantidad         numeric(14, 3) not null default 1,
  precio_unitario  numeric(14, 2) not null,
  importe          numeric(14, 2) not null check (importe > 0),
  -- null: exento
  alicuota_iva_id  smallint references public.alicuota_iva(id),
  unique (comprobante_id, orden)
);

create index comprobante_linea_comp_idx on public.comprobante_linea (comprobante_id);
create index comprobante_linea_iva_idx  on public.comprobante_linea (alicuota_iva_id);

alter table public.comprobante_linea enable row level security;

create policy comprobante_linea_select on public.comprobante_linea
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));

grant select on public.comprobante_linea to authenticated;

-- El motivo que se escribió al emitir una nota a mano.
alter table public.comprobante add column observaciones text;

-- ── Emitir la nota ──────────────────────────────────────────────
--
-- El identificador lo pone la pantalla: si se corta la conexión con la
-- nota ya grabada y se aprieta de nuevo, contesta la misma nota en vez
-- de sacar otro número.
create or replace function public.emitir_nota_manual(
  p_id             uuid,
  p_familia        text,
  p_cliente_id     uuid,
  p_asociado_id    uuid,
  p_lineas         jsonb,
  p_motivo         text,
  p_punto_venta_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig      public.comprobante;
  v_cliente   public.cliente;
  v_motivo    text := btrim(coalesce(p_motivo, ''));
  v_usuario   uuid := app.usuario_actual_id();
  v_hoy       date := app.hoy_en_obera();
  v_clase     char(1);
  v_tipo      smallint;
  v_desc_tipo text;
  v_pv        uuid;
  v_pv_numero integer;
  v_numero    bigint;
  v_concepto  smallint := 1;
  v_neto      numeric := 0;
  v_iva       numeric := 0;
  v_exento    numeric := 0;
  v_total     numeric := 0;
  v_ya_nc     numeric := 0;
  v_receptor  record;
begin
  if not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para emitir notas de crédito o débito.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la nota.';
  end if;
  if exists (select 1 from public.comprobante where id = p_id) then
    return p_id;
  end if;
  if p_familia is null or p_familia not in ('nota_credito', 'nota_debito') then
    raise exception 'Tiene que ser una nota de crédito o una de débito.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Hay que escribir el motivo de la nota.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La nota necesita al menos un renglón.';
  end if;

  drop table if exists nota_renglon;
  create temp table nota_renglon on commit drop as
  select x.n::smallint as orden,
         btrim(coalesce(x.r->>'descripcion', '')) as descripcion,
         round((x.r->>'importe')::numeric, 2) as importe,
         nullif(x.r->>'alicuota_iva_id', '')::smallint as alicuota_iva_id,
         0::numeric as porcentaje
  from jsonb_array_elements(p_lineas) with ordinality as x(r, n);

  if exists (select 1 from nota_renglon where descripcion = '') then
    raise exception 'Cada renglón necesita una descripción.';
  end if;
  if exists (select 1 from nota_renglon where importe is null or importe <= 0) then
    raise exception 'Cada renglón necesita un importe mayor que cero.';
  end if;
  if exists (
    select 1 from nota_renglon r
    where r.alicuota_iva_id is not null
      and not exists (select 1 from public.alicuota_iva a where a.id = r.alicuota_iva_id and a.activo)
  ) then
    raise exception 'Hay un renglón con una alícuota de IVA que no existe.';
  end if;

  update nota_renglon r set porcentaje = a.porcentaje
  from public.alicuota_iva a where a.id = r.alicuota_iva_id;

  -- ── De quién y con qué letra ──
  if p_asociado_id is not null then
    select * into v_orig from public.comprobante where id = p_asociado_id;
    if v_orig.id is null then
      raise exception 'La factura elegida no existe.';
    end if;
    if (select familia from public.tipo_comprobante where id = v_orig.tipo_comprobante_id) <> 'factura' then
      raise exception 'La nota se asocia a una factura, no a otra nota.';
    end if;
    if v_orig.estado not in ('autorizado', 'contingencia', 'informado') then
      raise exception 'La factura elegida no está autorizada por ARCA: no se le puede hacer una nota.';
    end if;
    if p_cliente_id is not null and v_orig.cliente_id is distinct from p_cliente_id then
      raise exception 'La factura elegida es de otro cliente.';
    end if;

    select tc.clase into v_clase from public.tipo_comprobante tc where tc.id = v_orig.tipo_comprobante_id;
    v_pv := v_orig.punto_venta_id;
    v_concepto := v_orig.concepto;
    select * into v_cliente from public.cliente where id = v_orig.cliente_id;
    select v_orig.receptor_nombre as nombre, v_orig.receptor_tipo_documento_id as tipo_doc,
           v_orig.receptor_documento as documento, v_orig.receptor_condicion_iva_id as condicion,
           v_orig.receptor_domicilio as domicilio
      into v_receptor;
  else
    if p_cliente_id is null then
      raise exception 'Elegí el cliente de la nota.';
    end if;
    select * into v_cliente from public.cliente where id = p_cliente_id and eliminado_en is null;
    if v_cliente.id is null then
      raise exception 'El cliente no existe.';
    end if;

    v_clase := public.tipo_comprobante_para(v_cliente.id);
    v_pv := p_punto_venta_id;
    if v_pv is null then
      select id into v_pv from public.punto_venta
      where activo and not es_respaldo and eliminado_en is null
      order by numero limit 1;
    end if;
    if v_pv is null then
      raise exception 'No hay punto de venta configurado para facturar.';
    end if;
    select v_cliente.nombre as nombre, v_cliente.tipo_documento_id as tipo_doc,
           v_cliente.numero_documento as documento, v_cliente.condicion_iva_id as condicion,
           nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.localidad)), '') as domicilio
      into v_receptor;
  end if;

  select tc.id, tc.descripcion into v_tipo, v_desc_tipo
  from public.tipo_comprobante tc
  where tc.clase = v_clase and tc.familia = p_familia and tc.activo;
  if v_tipo is null then
    raise exception 'No hay un tipo de nota activo para comprobantes %.', v_clase;
  end if;

  -- ── Importes: el renglón trae el importe con IVA, como en la venta ──
  select
    coalesce(sum(round(importe / (1 + porcentaje / 100), 2)) filter (where alicuota_iva_id is not null), 0),
    coalesce(sum(importe - round(importe / (1 + porcentaje / 100), 2)) filter (where alicuota_iva_id is not null), 0),
    coalesce(sum(importe) filter (where alicuota_iva_id is null), 0),
    coalesce(sum(importe), 0)
  into v_neto, v_iva, v_exento, v_total
  from nota_renglon;

  -- Una nota de crédito no devuelve más de lo que se facturó.
  if p_asociado_id is not null and p_familia = 'nota_credito' then
    select coalesce(sum(c.total), 0) into v_ya_nc
    from public.comprobante_asociado ca
    join public.comprobante c on c.id = ca.comprobante_id
    join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
    where ca.asociado_id = v_orig.id and tc.familia = 'nota_credito' and c.estado <> 'anulado';
    if v_total > v_orig.total - v_ya_nc + 0.009 then
      raise exception 'La factura es por % y ya tiene notas de crédito por %: esta nota puede ser de hasta %.',
        app.pesos(v_orig.total), app.pesos(v_ya_nc), app.pesos(greatest(v_orig.total - v_ya_nc, 0));
    end if;
  end if;

  v_numero := app.siguiente_numero_comprobante(v_pv, v_tipo);
  select numero into v_pv_numero from public.punto_venta where id = v_pv;

  insert into public.comprobante (
    id, tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
    estado, usuario_id, observaciones
  ) values (
    p_id, v_tipo, v_pv, v_numero, null, v_cliente.id,
    v_receptor.nombre, v_receptor.tipo_doc, v_receptor.documento,
    v_receptor.condicion, v_receptor.domicilio,
    v_hoy, v_concepto,
    v_neto, 0, v_exento, v_iva, 0, v_total,
    'pendiente', v_usuario, v_motivo
  );

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select p_id, alicuota_iva_id,
         sum(round(importe / (1 + porcentaje / 100), 2)),
         sum(importe - round(importe / (1 + porcentaje / 100), 2))
  from nota_renglon
  where alicuota_iva_id is not null
  group by alicuota_iva_id;

  insert into public.comprobante_linea
    (comprobante_id, orden, descripcion, cantidad, precio_unitario, importe, alicuota_iva_id)
  select p_id, orden, descripcion, 1, importe, importe, alicuota_iva_id
  from nota_renglon;

  if p_asociado_id is not null then
    insert into public.comprobante_asociado
      (comprobante_id, asociado_id, tipo_comprobante_id, punto_venta_numero, numero, fecha)
    values
      (p_id, v_orig.id, v_orig.tipo_comprobante_id,
       (select numero from public.punto_venta where id = v_orig.punto_venta_id),
       v_orig.numero, v_orig.fecha);
  end if;

  if v_cliente.id is not null and v_cliente.cuenta_corriente then
    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id, operador_id)
    values
      (v_cliente.id, p_familia,
       case when p_familia = 'nota_credito' then -v_total else v_total end,
       v_desc_tipo || ' ' || lpad(v_pv_numero::text, 5, '0') || '-' || lpad(v_numero::text, 8, '0')
         || ' — ' || v_motivo,
       'comprobante', p_id, v_usuario, v_usuario);
  end if;

  return p_id;
end;
$$;

comment on function public.emitir_nota_manual(uuid, text, uuid, uuid, jsonb, text, uuid) is
  'Nota de crédito o débito escrita a mano, asociada a una factura o sin factura. Mueve la cuenta corriente si el cliente la tiene. El CAE se pide después, como siempre.';

revoke all on function public.emitir_nota_manual(uuid, text, uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.emitir_nota_manual(uuid, text, uuid, uuid, jsonb, text, uuid) to authenticated;

-- ── El recibo libre ─────────────────────────────────────────────
alter table public.recibo
  add column libre           boolean not null default false,
  add column nombre_libre    text,
  add column documento_libre text;

alter table public.recibo drop constraint recibo_de_cliente_o_fiado;
alter table public.recibo add constraint recibo_de_quien check (
  (not libre and num_nonnulls(cliente_id, fiado_persona_id) = 1)
  or (libre and fiado_persona_id is null
      and (cliente_id is not null or length(btrim(coalesce(nombre_libre, ''))) > 0)));

-- El pago de un recibo libre no deja movimiento de cuenta ni de fiado.
alter table public.recibo_pago drop constraint recibo_pago_de_cuenta_o_fiado;
alter table public.recibo_pago add constraint recibo_pago_de_cuenta_o_fiado
  check (num_nonnulls(movimiento_id, fiado_pago_id) <= 1);

create or replace function public.emitir_recibo_libre(
  p_id            uuid,
  p_cliente_id    uuid,
  p_nombre        text,
  p_documento     text,
  p_medio_pago_id uuid,
  p_importe       numeric,
  p_caja_id       uuid,
  p_concepto      text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.recibo;
  v_medio     public.medio_pago;
  v_cliente   public.cliente;
  v_usuario   uuid := app.usuario_actual_id();
  v_serie     text := '0001';
  v_numero    bigint;
  v_importe   numeric(14, 2) := round(p_importe, 2);
  v_concepto  text := btrim(coalesce(p_concepto, ''));
  v_nombre    text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_estado    text;
begin
  if not app.tiene_permiso('cuentacorriente.cobrar') then
    raise exception 'No tenés permiso para emitir recibos.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del recibo.';
  end if;

  select * into v_existente from public.recibo where id = p_id;
  if v_existente.id is not null then
    return json_build_object('id', v_existente.id, 'serie', v_existente.serie,
                             'numero', v_existente.numero, 'total', v_existente.total, 'repetido', true);
  end if;

  if length(v_concepto) < 3 then
    raise exception 'Escribí por qué es el pago.';
  end if;
  if v_importe is null or v_importe <= 0 then
    raise exception 'El importe tiene que ser mayor que cero.';
  end if;

  if p_cliente_id is not null then
    select * into v_cliente from public.cliente where id = p_cliente_id and eliminado_en is null;
    if v_cliente.id is null then
      raise exception 'El cliente no existe.';
    end if;
    v_nombre := null;
  elsif v_nombre is null then
    raise exception 'Elegí el cliente o escribí a nombre de quién va el recibo.';
  end if;

  select * into v_medio from public.medio_pago where id = p_medio_pago_id and eliminado_en is null and activo;
  if v_medio.id is null then
    raise exception 'El medio de pago no existe o está inactivo.';
  end if;
  if v_medio.tipo in ('cuenta_corriente', 'fiado', 'cheque') then
    raise exception 'Un recibo libre se paga en efectivo, con tarjeta o con transferencia.';
  end if;

  if v_medio.afecta_caja then
    if p_caja_id is null then
      raise exception 'Cobrar en % necesita una caja abierta: si no, el dinero entra y el arqueo no lo ve.', v_medio.nombre;
    end if;
    select estado into v_estado from public.caja where id = p_caja_id for update;
    if v_estado is null then
      raise exception 'La caja indicada no existe.';
    end if;
    if v_estado <> 'abierta' then
      raise exception 'La caja está cerrada.';
    end if;
  end if;

  v_numero := app.siguiente_numero_recibo(v_serie);

  insert into public.recibo
    (id, serie, numero, cliente_id, fecha, total, concepto, emitido_por, caja_id,
     libre, nombre_libre, documento_libre)
  values
    (p_id, v_serie, v_numero, v_cliente.id, app.hoy_en_obera(), v_importe, v_concepto, v_usuario,
     (select id from public.caja where id = p_caja_id and estado = 'abierta'),
     true, v_nombre, case when v_cliente.id is null then nullif(btrim(coalesce(p_documento, '')), '') end);

  insert into public.recibo_pago (recibo_id, orden, medio_pago_id, importe)
  values (p_id, 1, v_medio.id, v_importe);

  if v_medio.afecta_caja then
    insert into public.caja_movimiento (caja_id, tipo, importe, concepto, usuario_id)
    values (p_caja_id, 'ingreso', v_importe,
            'Recibo ' || v_serie || '-' || lpad(v_numero::text, 8, '0') || ' — '
              || coalesce(v_cliente.nombre, v_nombre) || ' — ' || v_concepto,
            v_usuario);
  end if;

  return json_build_object('id', p_id, 'serie', v_serie, 'numero', v_numero, 'total', v_importe, 'repetido', false);
end;
$$;

comment on function public.emitir_recibo_libre(uuid, uuid, text, text, uuid, numeric, uuid, text) is
  'Recibo por un pago que no es cobranza de cuenta corriente. La plata entra a la caja; no toca ninguna cuenta.';

revoke all on function public.emitir_recibo_libre(uuid, uuid, text, text, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.emitir_recibo_libre(uuid, uuid, text, text, uuid, numeric, uuid, text) to authenticated;

-- ── Lo que ya existía, sabiendo del recibo libre ────────────────
-- Anularlo no le suma deuda a nadie; el registro y la vista lo muestran
-- con el nombre escrito; el cierre de caja también.

create or replace function public.anular_recibo(p_id uuid, p_motivo text, p_caja_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recibo  public.recibo;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_usuario uuid := app.usuario_actual_id();
  v_hoy     date := app.hoy_en_obera();
  v_texto   text;
  v_nombre  text;
  v_al_cajon numeric;
  v_estado  text;
  v_ch      public.cheque;
begin
  if not app.tiene_permiso('cuentacorriente.anular_recibo') then
    raise exception 'No tenés permiso para anular recibos.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Para anular un recibo hay que decir por qué.';
  end if;

  select * into v_recibo from public.recibo where id = p_id for update;
  if v_recibo.id is null then
    raise exception 'El recibo no existe.';
  end if;
  if v_recibo.anulado_en is not null then
    raise exception 'El recibo ya estaba anulado.';
  end if;

  v_texto := v_recibo.serie || '-' || lpad(v_recibo.numero::text, 8, '0');

  select coalesce(sum(rp.importe), 0) into v_al_cajon
  from public.recibo_pago rp
  join public.medio_pago mp on mp.id = rp.medio_pago_id
  where rp.recibo_id = p_id and mp.afecta_caja;

  if v_al_cajon > 0 then
    if p_caja_id is null then
      raise exception 'Hace falta una caja abierta: la plata de este recibo tiene que salir del cajón.';
    end if;
    select estado into v_estado from public.caja where id = p_caja_id for update;
    if v_estado is null then
      raise exception 'La caja indicada no existe.';
    end if;
    if v_estado <> 'abierta' then
      raise exception 'La caja está cerrada.';
    end if;
  end if;

  for v_ch in
    select c.* from public.recibo_pago rp
    join public.cheque c on c.id = rp.cheque_id
    where rp.recibo_id = p_id
    for update of c
  loop
    if v_ch.estado <> 'en_cartera' then
      raise exception 'El % ya figura %: el recibo no se puede anular.',
        app.nombre_del_cheque(v_ch), app.estado_del_cheque(v_ch.estado);
    end if;
    update public.cheque set motivo = v_motivo where id = v_ch.id;
    perform app.cheque_pasa_a(v_ch.id, 'devuelto', v_hoy, 'Se anuló el recibo ' || v_texto || ': ' || v_motivo);
  end loop;

  if v_recibo.libre then
    -- El recibo libre no tocó ninguna cuenta: sólo vuelve la plata del cajón.
    v_nombre := coalesce((select nombre from public.cliente where id = v_recibo.cliente_id), v_recibo.nombre_libre);
  elsif v_recibo.cliente_id is not null then
    select nombre into v_nombre from public.cliente where id = v_recibo.cliente_id;
    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, vencimiento, referencia_tipo, referencia_id, usuario_id, operador_id)
    values
      (v_recibo.cliente_id, 'nota_debito', v_recibo.total,
       'Se anuló el recibo ' || v_texto || ' — ' || v_motivo, v_hoy,
       'recibo', p_id, v_usuario, v_usuario);
  else
    select nombre into v_nombre from public.fiado_persona where id = v_recibo.fiado_persona_id;
    update public.fiado_pago set anulado_en = now()
    where id in (select fiado_pago_id from public.recibo_pago where recibo_id = p_id);
    delete from public.fiado_imputacion
    where pago_id in (select fiado_pago_id from public.recibo_pago where recibo_id = p_id);
  end if;

  if v_al_cajon > 0 then
    insert into public.caja_movimiento (caja_id, tipo, importe, concepto, usuario_id)
    values (p_caja_id, 'egreso', -v_al_cajon, 'Se anuló el recibo ' || v_texto || ' — ' || v_nombre, v_usuario);
  end if;

  update public.orden_recibo
  set estado = 'rechazada', recibo_id = null, motivo_rechazo = 'Se anuló el recibo ' || v_texto || ': ' || v_motivo,
      resuelto_por = v_usuario, resuelto_en = now()
  where recibo_id = p_id;

  update public.recibo
  set anulado_en = now(), anulado_por = v_usuario, motivo_anulacion = v_motivo
  where id = p_id;
end;
$$;

drop function public.listar_recibos(text, integer);

create function public.listar_recibos(p_texto text default null, p_limite integer default 200)
returns table(id uuid, serie text, numero bigint, fecha date, total numeric, cliente_id uuid, cliente_nombre text,
              medios text, orden_numero bigint, emitido_por_nombre text, mail_estado text, anulado_en timestamptz,
              libre boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_digitos text := nullif(regexp_replace(coalesce(p_texto, ''), '\D', '', 'g'), '');
  v_cuentas boolean := app.tiene_permiso('cuentacorriente.ver') or app.tiene_permiso('cuentacorriente.cobrar');
  v_fiados  boolean := app.tiene_permiso('fiados.ver');
begin
  if not (v_cuentas or v_fiados) then
    raise exception 'No tenés permiso para ver recibos.';
  end if;

  return query
  select r.id, r.serie, r.numero, r.fecha, r.total, c.id,
         coalesce(c.nombre, fp.nombre || ' (fiado)', r.nombre_libre),
         (select string_agg(distinct mp.nombre, ', ') from public.recibo_pago rp
          join public.medio_pago mp on mp.id = rp.medio_pago_id where rp.recibo_id = r.id),
         o.numero, u.nombre, r.mail_estado, r.anulado_en, r.libre
  from public.recibo r
  left join public.cliente c on c.id = r.cliente_id
  left join public.fiado_persona fp on fp.id = r.fiado_persona_id
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario u on u.id = r.emitido_por
  where ((r.cliente_id is not null and v_cuentas) or (r.fiado_persona_id is not null and v_fiados)
         or (r.libre and v_cuentas))
    and (v_texto is null
     or coalesce(c.nombre, fp.nombre, r.nombre_libre) ilike '%' || v_texto || '%'
     or coalesce(c.nombre_fantasia, '') ilike '%' || v_texto || '%'
     -- «12», «0001-00000012» y «00000012» encuentran el mismo recibo.
     or (v_digitos is not null and length(v_digitos) <= 12
         and (r.numero = right(v_digitos, 8)::bigint or r.numero = v_digitos::bigint)))
  order by r.emitido_en desc
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$$;

create or replace function public.recibo_completo(p_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_recibo    public.recibo;
  v_resultado json;
begin
  select * into v_recibo from public.recibo where id = p_id;
  if v_recibo.id is null then
    raise exception 'El recibo no existe.';
  end if;
  if v_recibo.cliente_id is not null
     and not (app.tiene_permiso('cuentacorriente.ver') or app.tiene_permiso('cuentacorriente.cobrar')) then
    raise exception 'No tenés permiso para ver recibos.';
  end if;
  if v_recibo.libre
     and not (app.tiene_permiso('cuentacorriente.ver') or app.tiene_permiso('cuentacorriente.cobrar')) then
    raise exception 'No tenés permiso para ver recibos.';
  end if;
  if v_recibo.fiado_persona_id is not null and not app.tiene_permiso('fiados.ver') then
    raise exception 'No tenés permiso para ver recibos.';
  end if;

  select json_build_object(
    'id', r.id, 'serie', r.serie, 'numero', r.numero, 'fecha', r.fecha, 'total', r.total,
    'concepto', r.concepto, 'emitido_en', r.emitido_en,
    'emitido_por_nombre', u.nombre,
    'anulado_en', r.anulado_en, 'anulado_por_nombre', ua.nombre, 'motivo_anulacion', r.motivo_anulacion,
    'mail_destinatario', r.mail_destinatario, 'mail_estado', r.mail_estado,
    'mail_error', r.mail_error, 'mail_en', r.mail_en,
    'cliente_id', c.id, 'libre', r.libre,
    'cliente_nombre', coalesce(c.nombre, fp.nombre, r.nombre_libre), 'cliente_email', c.email,
    'cliente_documento', coalesce(r.documento_libre, c.numero_documento, fp.documento),
    'cliente_domicilio', coalesce(nullif(concat_ws(' ', c.calle, c.numero) || coalesce(', ' || c.localidad, ''), ''),
                                  fp.domicilio),
    'fiado_persona_id', fp.id,
    'saldo_despues', case
      when r.libre then null
      when c.id is not null then
        (select coalesce(sum(m.importe), 0) from public.movimiento_cuenta_corriente m
         where m.cliente_id = c.id and m.ocurrido_en <= r.emitido_en + interval '1 second')
      else
        (select coalesce(sum(f.importe), 0) from public.fiado f
         where f.persona_id = fp.id and f.anulado_en is null and f.creado_en <= r.emitido_en + interval '1 second')
        - (select coalesce(sum(i.importe), 0) from public.fiado_imputacion i
           join public.fiado_pago p on p.id = i.pago_id
           join public.fiado f on f.id = i.fiado_id
           where p.persona_id = fp.id and f.anulado_en is null and p.creado_en <= r.emitido_en + interval '1 second')
      end,
    'orden_numero', o.numero, 'orden_vendedor', uv.nombre,
    -- Para anularlo: si entró plata al cajón, tiene que salir de una caja abierta.
    'paso_por_caja', exists (
      select 1 from public.recibo_pago rp
      join public.medio_pago mp on mp.id = rp.medio_pago_id
      where rp.recibo_id = r.id and mp.afecta_caja),
    'pagos', coalesce((
      select json_agg(json_build_object(
               'medio', mp.nombre, 'importe', rp.importe,
               'cheque', case when ch.id is not null then
                 json_build_object('banco', ch.banco, 'numero', ch.numero, 'fecha_pago', ch.fecha_pago,
                                   'librador', ch.librador) end)
             order by rp.orden)
      from public.recibo_pago rp
      join public.medio_pago mp on mp.id = rp.medio_pago_id
      left join public.cheque ch on ch.id = rp.cheque_id
      where rp.recibo_id = r.id), '[]'::json)
  )
  into v_resultado
  from public.recibo r
  left join public.cliente c on c.id = r.cliente_id
  left join public.fiado_persona fp on fp.id = r.fiado_persona_id
  left join public.usuario u on u.id = r.emitido_por
  left join public.usuario ua on ua.id = r.anulado_por
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario uv on uv.id = o.vendedor_id
  where r.id = p_id;

  return v_resultado;
end;
$$;

create or replace function app.armar_resumen_de_caja(p_caja_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caja public.caja;
  v_res  jsonb;
begin
  select * into v_caja from public.caja where id = p_caja_id;
  if v_caja.id is null then
    raise exception 'La caja no existe.';
  end if;

  select jsonb_build_object(
    'caja', jsonb_build_object(
      'id', v_caja.id,
      'terminal', (select nombre from public.terminal where id = v_caja.terminal_id),
      'cajero', (select nombre from public.usuario where id = v_caja.cajero_id),
      'cerro', (select nombre from public.usuario where id = v_caja.cerrada_por),
      'estado', v_caja.estado,
      'abierta_en', v_caja.abierta_en,
      'cerrada_en', v_caja.cerrada_en,
      'monto_inicial', v_caja.monto_inicial,
      'monto_declarado', v_caja.monto_declarado,
      'monto_esperado', v_caja.monto_esperado,
      'diferencia', v_caja.diferencia),

    'ventas', jsonb_build_object(
      'cantidad', (select count(*) from public.venta where caja_id = p_caja_id and estado = 'cobrada'),
      'total', (select coalesce(sum(total), 0) from public.venta where caja_id = p_caja_id and estado = 'cobrada'),
      'anuladas', (select count(*) from public.venta where caja_id = p_caja_id and estado = 'anulada'),
      'por_medio', coalesce((
        select jsonb_agg(x order by x.orden, x.medio)
        from (
          select mp.nombre medio, mp.orden, mp.afecta_caja, count(distinct v.id) cantidad, sum(vp.importe) importe
          from public.venta v
          join public.venta_pago vp on vp.venta_id = v.id
          join public.medio_pago mp on mp.id = vp.medio_pago_id
          where v.caja_id = p_caja_id and v.estado = 'cobrada'
          group by mp.id, mp.nombre, mp.orden, mp.afecta_caja) x), '[]'::jsonb),
      -- Una caja para todos los puestos: quién cobró cada cosa, y cuánto
      -- de eso fue efectivo, que es lo que tiene que estar en el cajón.
      'por_cajero', coalesce((
        select jsonb_agg(x order by x.total desc)
        from (
          select coalesce(u.nombre, 'Sin nombre') cajero, count(*) cantidad, sum(v.total) total,
                 coalesce(sum((select sum(vp.importe)
                                 from public.venta_pago vp join public.medio_pago mp on mp.id = vp.medio_pago_id
                                where vp.venta_id = v.id and mp.afecta_caja)), 0) efectivo
          from public.venta v
          left join public.usuario u on u.id = v.cajero_id
          where v.caja_id = p_caja_id and v.estado = 'cobrada'
          group by u.nombre) x), '[]'::jsonb),
      'por_documentacion', coalesce((
        select jsonb_agg(x order by x.documentacion)
        from (
          select documentacion, count(*) cantidad, sum(total) total
          from public.venta where caja_id = p_caja_id and estado = 'cobrada'
          group by documentacion) x), '[]'::jsonb)),

    'cobranzas', jsonb_build_object(
      'por_medio', coalesce((
        select jsonb_agg(x order by x.orden, x.medio)
        from (
          select mp.nombre medio, mp.orden, count(distinct r.id) cantidad, sum(rp.importe) importe
          from public.recibo r
          join public.recibo_pago rp on rp.recibo_id = r.id
          join public.medio_pago mp on mp.id = rp.medio_pago_id
          where r.caja_id = p_caja_id and r.anulado_en is null
          group by mp.id, mp.nombre, mp.orden) x), '[]'::jsonb),
      'detalle', coalesce((
        select jsonb_agg(x order by x.emitido_en)
        from (
          select r.serie || '-' || lpad(r.numero::text, 8, '0') numero, r.emitido_en, r.total,
                 coalesce(cl.nombre, fp.nombre, r.nombre_libre) cliente, r.anulado_en is not null anulado,
                 (select string_agg(distinct mp.nombre, ', ')
                    from public.recibo_pago rp join public.medio_pago mp on mp.id = rp.medio_pago_id
                   where rp.recibo_id = r.id) medios
          from public.recibo r
          left join public.cliente cl on cl.id = r.cliente_id
          left join public.fiado_persona fp on fp.id = r.fiado_persona_id
          where r.caja_id = p_caja_id) x), '[]'::jsonb)),

    'movimientos', coalesce((
      select jsonb_agg(x order by x.creado_en)
      from (
        select m.id, m.tipo, m.categoria, m.forma, m.importe, m.concepto, m.excluir_del_cierre,
               m.creado_en, m.anulado_en, m.motivo_anulacion,
               u.nombre usuario, e.nombre empleado, pr.nombre proveedor,
               (select coalesce(jsonb_agg(jsonb_build_object(
                         'nombre', app.nombre_del_cheque(c), 'importe', c.importe, 'fecha_pago', c.fecha_pago)
                         order by c.fecha_pago), '[]'::jsonb)
                  from public.pago_proveedor_medio pm join public.cheque c on c.id = pm.cheque_id
                 where pm.pago_id = m.pago_proveedor_id) cheques
        from public.caja_movimiento m
        left join public.usuario u on u.id = m.usuario_id
        left join public.usuario e on e.id = m.empleado_id
        left join public.proveedor pr on pr.id = m.proveedor_id
        where m.caja_id = p_caja_id and m.categoria <> 'sistema') x), '[]'::jsonb),

    'cheques_recibidos', coalesce((
      select jsonb_agg(x order by x.fecha_pago)
      from (
        select app.nombre_del_cheque(c) nombre, c.importe, c.fecha_pago, cl.nombre cliente
        from public.cheque c
        left join public.cliente cl on cl.id = c.cliente_id
        where c.caja_id = p_caja_id
           or c.id in (select rp.cheque_id from public.recibo_pago rp join public.recibo r on r.id = rp.recibo_id
                        where r.caja_id = p_caja_id and r.anulado_en is null)) x), '[]'::jsonb),

    'devoluciones', app.devoluciones_del_turno(v_caja),

    'efectivo', jsonb_build_object(
      'inicial', v_caja.monto_inicial,
      'ventas', (
        select coalesce(sum(vp.importe), 0)
        from public.venta v
        join public.venta_pago vp on vp.venta_id = v.id
        join public.medio_pago mp on mp.id = vp.medio_pago_id
        where v.caja_id = p_caja_id and v.estado = 'cobrada' and mp.afecta_caja),
      'cobranzas', (
        select coalesce(sum(importe), 0) from public.caja_movimiento
        where caja_id = p_caja_id and categoria = 'sistema'),
      'ingresos', (
        select coalesce(sum(importe), 0) from public.caja_movimiento
        where caja_id = p_caja_id and categoria <> 'sistema' and tipo = 'ingreso'
          and forma = 'efectivo' and not excluir_del_cierre and anulado_en is null),
      'egresos', (
        select coalesce(sum(importe), 0) from public.caja_movimiento
        where caja_id = p_caja_id and categoria <> 'sistema' and tipo = 'egreso'
          and forma = 'efectivo' and not excluir_del_cierre and anulado_en is null),
      'esperado', app.efectivo_esperado(p_caja_id))
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.listar_recibos(text, integer) from public, anon;
grant execute on function public.listar_recibos(text, integer) to authenticated, service_role;
