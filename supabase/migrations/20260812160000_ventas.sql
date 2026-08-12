-- ═══════════════════════════════════════════════════════════════
-- 009 — VENTAS Y CAJA
--
-- EL CIRCUITO (el modelo que pidio Lucas, tipo Cetrogar)
--
--   vendedor arma con su PIN  ->  envia a caja  ->  cajero cobra
--                                                     |
--                              descuenta stock  <-----+
--                              cuenta corriente <-----+
--                              comprobante ARCA <-----+  (modulo siguiente)
--
-- TRES DECISIONES QUE IMPORTAN
--
-- 1) LA LINEA GUARDA UNA FOTO, NO UNA REFERENCIA.
--    precio, alicuota de IVA y descripcion se copian a la linea en el
--    momento de la venta. Si manana cambia el precio del producto, o lo
--    renombran, o lo dan de baja, la venta de ayer no se mueve. Es el
--    error clasico de los sistemas de facturacion: leer el precio actual
--    al reimprimir un comprobante viejo.
--
-- 2) LA NUMERACION ES POR TERMINAL.
--    Sin conexion, dos terminales no pueden coordinar un contador
--    compartido. Cada una tiene su prefijo y su propia secuencia, asi
--    que puede numerar sola. Ojo: esto es la numeracion INTERNA de la
--    venta, no la del comprobante fiscal, que la asigna ARCA.
--
-- 3) UNA VENTA COBRADA NO SE EDITA NI SE BORRA.
--    Se anula, y la anulacion genera los movimientos que compensan
--    stock y cuenta corriente. Misma disciplina que el resto del sistema.
-- ═══════════════════════════════════════════════════════════════

-- Prefijo de numeracion propio de cada terminal
alter table public.terminal add column prefijo text;
create unique index terminal_prefijo_unico on public.terminal (upper(prefijo))
  where prefijo is not null and eliminado_en is null;
comment on column public.terminal.prefijo is
  'Prefijo de numeracion interna de esta terminal (ej. CAJA1, MOST2). Permite numerar sin conexion sin chocar con otras.';

-- ───────────────────────────────────────────────────────────────
-- Turno de caja
-- ───────────────────────────────────────────────────────────────
create table public.caja (
  id              uuid primary key default gen_random_uuid(),
  terminal_id     uuid not null references public.terminal(id) on delete restrict,
  cajero_id       uuid references public.usuario(id) on delete set null,
  estado          text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  monto_inicial   numeric(14,4) not null default 0 check (monto_inicial >= 0),
  -- lo que el cajero cuenta al cerrar
  monto_declarado numeric(14,4),
  -- lo que el sistema calcula que deberia haber
  monto_esperado  numeric(14,4),
  diferencia      numeric(14,4),
  abierta_en      timestamptz not null default now(),
  cerrada_en      timestamptz,
  observaciones   text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Una sola caja abierta por terminal a la vez
create unique index caja_abierta_unica on public.caja (terminal_id) where estado = 'abierta';
create index caja_cajero_idx on public.caja (cajero_id);
create index caja_abierta_en_idx on public.caja (abierta_en desc);

create trigger caja_actualizado_en before update on public.caja
  for each row execute function app.set_actualizado_en();

-- Ingresos y egresos de caja que no son ventas: retiros, gastos, adelantos
create table public.caja_movimiento (
  id             uuid primary key default gen_random_uuid(),
  caja_id        uuid not null references public.caja(id) on delete cascade,
  tipo           text not null check (tipo in ('ingreso', 'egreso')),
  -- positivo suma, negativo resta
  importe        numeric(14,4) not null check (importe <> 0),
  concepto       text not null,
  usuario_id     uuid references public.usuario(id) on delete set null,
  creado_en      timestamptz not null default now(),

  constraint caja_movimiento_signo check (
    (tipo = 'ingreso' and importe > 0) or (tipo = 'egreso' and importe < 0)
  )
);

create index caja_movimiento_caja_idx    on public.caja_movimiento (caja_id);
create index caja_movimiento_usuario_idx on public.caja_movimiento (usuario_id);

-- ───────────────────────────────────────────────────────────────
-- Venta
-- ───────────────────────────────────────────────────────────────
create table public.venta (
  -- generado por el cliente, incluso offline
  id                 uuid primary key default gen_random_uuid(),
  -- numeracion interna: prefijo de terminal + secuencia local
  codigo             text not null,

  estado             text not null default 'borrador'
                       check (estado in ('borrador', 'en_caja', 'cobrada', 'anulada')),

  cliente_id         uuid not null references public.cliente(id) on delete restrict,

  -- quien vendio y quien cobro pueden ser personas distintas
  vendedor_id        uuid references public.usuario(id)  on delete set null,
  cajero_id          uuid references public.usuario(id)  on delete set null,
  terminal_origen_id uuid references public.terminal(id) on delete set null,
  caja_id            uuid references public.caja(id)     on delete set null,

  -- totales, mantenidos por trigger desde las lineas
  subtotal           numeric(14,4) not null default 0,
  descuento_total    numeric(14,4) not null default 0,
  total              numeric(14,4) not null default 0,

  observaciones      text,

  ocurrido_en        timestamptz not null default now(),
  enviada_caja_en    timestamptz,
  cobrada_en         timestamptz,
  anulada_en         timestamptz,
  anulada_por        uuid references public.usuario(id) on delete set null,
  motivo_anulacion   text,

  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  registrado_offline boolean not null default false
);

create unique index venta_codigo_unico   on public.venta (upper(codigo));
create index venta_estado_idx            on public.venta (estado, ocurrido_en desc);
create index venta_cliente_idx           on public.venta (cliente_id, ocurrido_en desc);
create index venta_vendedor_idx          on public.venta (vendedor_id, ocurrido_en desc);
create index venta_cajero_idx            on public.venta (cajero_id);
create index venta_caja_idx              on public.venta (caja_id);
create index venta_terminal_idx          on public.venta (terminal_origen_id);
create index venta_anulada_por_idx       on public.venta (anulada_por);
create index venta_ocurrido_idx          on public.venta (ocurrido_en desc);
create index venta_actualizado_idx       on public.venta (actualizado_en);

create trigger venta_actualizado_en before update on public.venta
  for each row execute function app.set_actualizado_en();

comment on column public.venta.codigo is
  'Numeracion interna (prefijo de terminal + secuencia). NO es el numero del comprobante fiscal, que lo asigna ARCA.';

-- ───────────────────────────────────────────────────────────────
-- Lineas
--
-- Todo lo necesario para reimprimir el comprobante dentro de diez anios
-- vive aca. La linea no depende de que el producto siga existiendo.
-- ───────────────────────────────────────────────────────────────
create table public.venta_linea (
  id                 uuid primary key default gen_random_uuid(),
  venta_id           uuid not null references public.venta(id) on delete cascade,
  orden              integer not null default 0,

  producto_id        uuid references public.producto(id) on delete set null,
  -- foto: si el producto se renombra o se da de baja, esto no cambia
  codigo_producto    text not null,
  descripcion        text not null,

  cantidad           numeric(14,4) not null check (cantidad > 0),

  -- precio que devolvio el calculo automatico
  precio_original    numeric(14,4) not null check (precio_original >= 0),
  -- precio efectivamente aplicado; puede diferir si se modifico a mano
  precio_unitario    numeric(14,4) not null check (precio_unitario >= 0),
  motivo_modificacion text,
  modificado_por     uuid references public.usuario(id) on delete set null,

  -- foto de la alicuota al momento de vender
  alicuota_iva_id    smallint not null references public.alicuota_iva(id),
  condicion_iva      text not null default 'gravado'
                       check (condicion_iva in ('gravado', 'exento', 'no_gravado')),

  importe            numeric(14,4) generated always as (cantidad * precio_unitario) stored,

  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  -- Si el precio se toco a mano, tiene que constar quien y por que
  constraint venta_linea_modificacion_justificada check (
    precio_unitario = precio_original
    or (modificado_por is not null and motivo_modificacion is not null)
  )
);

create index venta_linea_venta_idx    on public.venta_linea (venta_id, orden);
create index venta_linea_producto_idx on public.venta_linea (producto_id);
create index venta_linea_modificado_idx on public.venta_linea (modificado_por)
  where modificado_por is not null;

create trigger venta_linea_actualizado_en before update on public.venta_linea
  for each row execute function app.set_actualizado_en();

comment on column public.venta_linea.precio_original is
  'Lo que devolvio calcular_precio(). Comparado con precio_unitario revela toda modificacion manual.';

-- ───────────────────────────────────────────────────────────────
-- Pagos — una venta puede pagarse con varios medios
-- ───────────────────────────────────────────────────────────────
create table public.venta_pago (
  id            uuid primary key default gen_random_uuid(),
  venta_id      uuid not null references public.venta(id) on delete cascade,
  medio_pago_id uuid not null references public.medio_pago(id) on delete restrict,
  importe       numeric(14,4) not null check (importe > 0),
  cuotas        integer not null default 1 check (cuotas >= 1),
  -- nro de lote/cupon de tarjeta, comprobante de transferencia
  referencia    text,
  creado_en     timestamptz not null default now()
);

create index venta_pago_venta_idx on public.venta_pago (venta_id);
create index venta_pago_medio_idx on public.venta_pago (medio_pago_id);

-- ───────────────────────────────────────────────────────────────
-- Totales de la venta, recalculados desde las lineas
--
-- Se mantienen por trigger para que no puedan quedar desfasados de las
-- lineas. La terminal los calcula igual para mostrarlos al instante,
-- pero la version que manda es esta.
-- ───────────────────────────────────────────────────────────────
create or replace function app.recalcular_totales_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta uuid := coalesce(new.venta_id, old.venta_id);
begin
  update public.venta v
  set subtotal        = coalesce(t.bruto, 0),
      descuento_total = coalesce(t.descuento, 0),
      total           = coalesce(t.neto, 0)
  from (
    select
      sum(l.cantidad * l.precio_original) as bruto,
      sum(l.cantidad * (l.precio_original - l.precio_unitario)) as descuento,
      sum(l.importe) as neto
    from public.venta_linea l
    where l.venta_id = v_venta
  ) t
  where v.id = v_venta;

  return null;
end;
$$;

create trigger venta_linea_totales
  after insert or update or delete on public.venta_linea
  for each row execute function app.recalcular_totales_venta();

-- ───────────────────────────────────────────────────────────────
-- Una venta cobrada o anulada queda congelada
-- ───────────────────────────────────────────────────────────────
create or replace function app.proteger_venta_cerrada()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
begin
  select v.estado into v_estado
  from public.venta v
  where v.id = coalesce(new.venta_id, old.venta_id);

  if v_estado in ('cobrada', 'anulada') then
    raise exception 'La venta ya esta % y no admite cambios. Para corregir, anulala y hace una nueva.', v_estado;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger venta_linea_protegida
  before insert or update or delete on public.venta_linea
  for each row execute function app.proteger_venta_cerrada();

create trigger venta_pago_protegido
  before insert or update or delete on public.venta_pago
  for each row execute function app.proteger_venta_cerrada();

-- ───────────────────────────────────────────────────────────────
-- COBRAR
--
-- Todo o nada. Si algo falla, no queda ni stock descontado ni deuda
-- registrada ni venta cobrada a medias.
-- ───────────────────────────────────────────────────────────────
create or replace function public.cobrar_venta(
  p_venta_id  uuid,
  p_caja_id   uuid default null,
  p_cajero_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta        public.venta;
  v_pagado       numeric;
  v_cta_cte      numeric;
  v_cliente      public.cliente;
  v_saldo        numeric;
  v_cajero       uuid;
  v_terminal     uuid;
begin
  -- Bloqueo de fila: dos cajas no pueden cobrar la misma venta a la vez
  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado not in ('borrador', 'en_caja') then
    raise exception 'La venta esta % y no se puede cobrar.', v_venta.estado;
  end if;
  if not exists (select 1 from public.venta_linea where venta_id = p_venta_id) then
    raise exception 'La venta no tiene productos.';
  end if;

  v_cajero := coalesce(p_cajero_id, app.usuario_actual_id());

  select coalesce(sum(importe), 0) into v_pagado
  from public.venta_pago where venta_id = p_venta_id;

  -- Tolerancia de un centavo por redondeo
  if abs(v_pagado - v_venta.total) > 0.01 then
    raise exception 'Los pagos suman % y el total es %.', v_pagado, v_venta.total;
  end if;

  -- Parte financiada en cuenta corriente
  select coalesce(sum(vp.importe), 0) into v_cta_cte
  from public.venta_pago vp
  join public.medio_pago mp on mp.id = vp.medio_pago_id
  where vp.venta_id = p_venta_id and mp.tipo = 'cuenta_corriente';

  if v_cta_cte > 0 then
    select * into v_cliente from public.cliente where id = v_venta.cliente_id;

    if not v_cliente.cuenta_corriente then
      raise exception 'El cliente % no tiene cuenta corriente habilitada.', v_cliente.nombre;
    end if;

    if v_cliente.limite_credito is not null then
      select coalesce(saldo, 0) into v_saldo
      from public.cuenta_corriente_saldo where cliente_id = v_cliente.id;

      if coalesce(v_saldo, 0) + v_cta_cte > v_cliente.limite_credito then
        raise exception 'Excede el limite de credito: saldo %, esta venta %, limite %.',
          coalesce(v_saldo, 0), v_cta_cte, v_cliente.limite_credito;
      end if;
    end if;
  end if;

  select terminal_id into v_terminal from public.caja where id = p_caja_id;

  -- Salida de stock, una por linea
  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
     usuario_id, operador_id, terminal_id, ocurrido_en)
  select l.producto_id, 'venta', -l.cantidad,
         'Venta ' || v_venta.codigo, 'venta', v_venta.id,
         v_cajero, v_venta.vendedor_id,
         coalesce(v_terminal, v_venta.terminal_origen_id), v_venta.ocurrido_en
  from public.venta_linea l
  where l.venta_id = p_venta_id and l.producto_id is not null;

  -- Deuda, si se financio
  if v_cta_cte > 0 then
    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, vencimiento,
       referencia_tipo, referencia_id, usuario_id, operador_id, ocurrido_en)
    values
      (v_venta.cliente_id, 'venta', v_cta_cte, 'Venta ' || v_venta.codigo,
       current_date + coalesce(v_cliente.dias_vencimiento, 30),
       'venta', v_venta.id, v_cajero, v_venta.vendedor_id, v_venta.ocurrido_en);
  end if;

  update public.venta
  set estado     = 'cobrada',
      cobrada_en = now(),
      cajero_id  = v_cajero,
      caja_id    = coalesce(p_caja_id, caja_id)
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

comment on function public.cobrar_venta(uuid, uuid, uuid) is
  'Cobra una venta de forma atomica: valida pagos y limite de credito, descuenta stock y registra la deuda. Todo o nada.';

grant execute on function public.cobrar_venta(uuid, uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- ANULAR
--
-- No borra nada: genera los movimientos que compensan.
-- ───────────────────────────────────────────────────────────────
create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo   text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta   public.venta;
  v_cta_cte numeric;
  v_usuario uuid;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la anulacion.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya estaba anulada.';
  end if;

  v_usuario := app.usuario_actual_id();

  if v_venta.estado = 'cobrada' then
    -- Reingreso de stock
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
    select l.producto_id, 'devolucion', l.cantidad,
           'Anulacion venta ' || v_venta.codigo, 'venta', v_venta.id, v_usuario
    from public.venta_linea l
    where l.venta_id = p_venta_id and l.producto_id is not null;

    -- Reversa de la deuda
    select coalesce(sum(vp.importe), 0) into v_cta_cte
    from public.venta_pago vp
    join public.medio_pago mp on mp.id = vp.medio_pago_id
    where vp.venta_id = p_venta_id and mp.tipo = 'cuenta_corriente';

    if v_cta_cte > 0 then
      insert into public.movimiento_cuenta_corriente
        (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id)
      values
        (v_venta.cliente_id, 'nota_credito', -v_cta_cte,
         'Anulacion venta ' || v_venta.codigo, 'venta', v_venta.id, v_usuario);
    end if;
  end if;

  update public.venta
  set estado           = 'anulada',
      anulada_en       = now(),
      anulada_por      = v_usuario,
      motivo_anulacion = p_motivo
  where id = p_venta_id;

  return p_venta_id;
end;
$$;

comment on function public.anular_venta(uuid, text) is
  'Anula una venta generando los movimientos que compensan stock y cuenta corriente. No borra nada.';

grant execute on function public.anular_venta(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- CERRAR CAJA
-- ───────────────────────────────────────────────────────────────
create or replace function public.cerrar_caja(
  p_caja_id        uuid,
  p_monto_declarado numeric
)
returns table (esperado numeric, declarado numeric, diferencia numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_caja      public.caja;
  v_ventas    numeric;
  v_movim     numeric;
  v_esperado  numeric;
begin
  select * into v_caja from public.caja where id = p_caja_id for update;

  if v_caja.id is null then
    raise exception 'La caja no existe.';
  end if;
  if v_caja.estado = 'cerrada' then
    raise exception 'La caja ya esta cerrada.';
  end if;

  -- Solo cuenta lo que efectivamente entra al cajon
  select coalesce(sum(vp.importe), 0) into v_ventas
  from public.venta v
  join public.venta_pago vp on vp.venta_id = v.id
  join public.medio_pago mp on mp.id = vp.medio_pago_id
  where v.caja_id = p_caja_id and v.estado = 'cobrada' and mp.afecta_caja;

  select coalesce(sum(importe), 0) into v_movim
  from public.caja_movimiento where caja_id = p_caja_id;

  v_esperado := v_caja.monto_inicial + v_ventas + v_movim;

  update public.caja
  set estado          = 'cerrada',
      cerrada_en      = now(),
      monto_declarado = p_monto_declarado,
      monto_esperado  = v_esperado,
      diferencia      = p_monto_declarado - v_esperado
  where id = p_caja_id;

  esperado   := v_esperado;
  declarado  := p_monto_declarado;
  diferencia := p_monto_declarado - v_esperado;
  return next;
end;
$$;

grant execute on function public.cerrar_caja(uuid, numeric) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Vista de ventas con IVA discriminado
--
-- El precio incluye IVA, asi que el neto se desarma. Es lo que
-- necesita el modulo de facturacion y el libro de IVA ventas.
-- ───────────────────────────────────────────────────────────────
create view public.vista_venta_iva
with (security_invoker = true) as
select
  v.id            as venta_id,
  v.codigo,
  v.estado,
  v.cliente_id,
  v.ocurrido_en,
  l.alicuota_iva_id,
  a.porcentaje    as alicuota,
  sum(l.importe)  as total_con_iva,
  round(sum(l.importe / (1 + a.porcentaje / 100)), 2)                    as neto,
  round(sum(l.importe - l.importe / (1 + a.porcentaje / 100)), 2)        as iva
from public.venta v
join public.venta_linea l   on l.venta_id = v.id
join public.alicuota_iva a  on a.id = l.alicuota_iva_id
where l.condicion_iva = 'gravado'
group by v.id, v.codigo, v.estado, v.cliente_id, v.ocurrido_en, l.alicuota_iva_id, a.porcentaje;

comment on view public.vista_venta_iva is
  'Venta desglosada por alicuota, con neto e IVA calculados a partir del precio que ya los incluye. Insumo de facturacion y del libro de IVA ventas.';

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.caja            enable row level security;
alter table public.caja_movimiento enable row level security;
alter table public.venta           enable row level security;
alter table public.venta_linea     enable row level security;
alter table public.venta_pago      enable row level security;

-- Un vendedor ve lo suyo; con ventas.ver_todas se ve todo.
create policy venta_select on public.venta
  for select to authenticated
  using (
    (select app.tiene_permiso('ventas.ver_todas'))
    or vendedor_id = (select app.usuario_actual_id())
    or cajero_id   = (select app.usuario_actual_id())
  );
create policy venta_insert on public.venta
  for insert to authenticated with check ((select app.tiene_permiso('ventas.crear')));
create policy venta_update on public.venta
  for update to authenticated
  using ((select app.tiene_permiso('ventas.crear')) or (select app.tiene_permiso('ventas.cobrar')))
  with check ((select app.tiene_permiso('ventas.crear')) or (select app.tiene_permiso('ventas.cobrar')));

create policy venta_linea_select on public.venta_linea
  for select to authenticated using ((select app.tiene_permiso('ventas.crear')));
create policy venta_linea_insert on public.venta_linea
  for insert to authenticated with check ((select app.tiene_permiso('ventas.crear')));
create policy venta_linea_update on public.venta_linea
  for update to authenticated
  using ((select app.tiene_permiso('ventas.crear')))
  with check ((select app.tiene_permiso('ventas.crear')));
create policy venta_linea_delete on public.venta_linea
  for delete to authenticated using ((select app.tiene_permiso('ventas.crear')));

create policy venta_pago_select on public.venta_pago
  for select to authenticated using ((select app.tiene_permiso('ventas.crear')));
create policy venta_pago_insert on public.venta_pago
  for insert to authenticated with check ((select app.tiene_permiso('ventas.cobrar')));
create policy venta_pago_delete on public.venta_pago
  for delete to authenticated using ((select app.tiene_permiso('ventas.cobrar')));

create policy caja_select on public.caja
  for select to authenticated using ((select app.tiene_permiso('ventas.crear')));
create policy caja_insert on public.caja
  for insert to authenticated with check ((select app.tiene_permiso('caja.abrir')));
create policy caja_update on public.caja
  for update to authenticated
  using ((select app.tiene_permiso('caja.cerrar')))
  with check ((select app.tiene_permiso('caja.cerrar')));

create policy caja_movimiento_select on public.caja_movimiento
  for select to authenticated using ((select app.tiene_permiso('ventas.crear')));
create policy caja_movimiento_insert on public.caja_movimiento
  for insert to authenticated with check ((select app.tiene_permiso('caja.abrir')));

grant select on public.caja, public.caja_movimiento, public.venta,
                 public.venta_linea, public.venta_pago, public.vista_venta_iva
  to authenticated;
grant insert, update on public.caja, public.venta to authenticated;
grant insert on public.caja_movimiento to authenticated;
grant insert, update, delete on public.venta_linea to authenticated;
grant insert, delete on public.venta_pago to authenticated;
