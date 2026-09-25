-- ═══════════════════════════════════════════════════════════════
-- PEDIDOS WEB: PREPARAR, FACTURAR, ENTREGAR, CANCELAR Y DEVOLVER
--
-- Segundo paso de los pedidos (diseño aprobado el 25/09). El pedido ya
-- entra como venta; esto es lo que el local hace con él después.
--
-- Casi nada es nuevo: cancelar es anular la venta, facturar es el
-- circuito de siempre y devolver es la devolución parcial de siempre.
-- Lo nuevo es el pedido que sigue a su venta, y el REINTEGRO: cuando
-- el cliente pagó en la web, la plata la tiene la pasarela de la
-- tienda y no el cajón, así que el sistema no la puede devolver. Lo
-- que sí puede es no olvidarse de que alguien la tiene que devolver.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1. El permiso
--
-- Aparte de ventas.ver_todas a propósito: el cajero ve todas las
-- ventas, pero decidir qué se factura y qué se cancela de la tienda
-- es del encargado.
-- ───────────────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('tienda.pedidos', 'Ventas', 'Atender los pedidos de la tienda online: preparar, facturar, entregar y cancelar', 260)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'tienda.pedidos' from public.rol r
where r.nombre in ('Administrador', 'Encargado') and r.eliminado_en is null
on conflict do nothing;


-- ───────────────────────────────────────────────────────────────
-- 2. Lo que el pedido guarda de su recorrido
--
-- Quién y cuándo en cada paso: si un pedido se entregó sin factura o
-- se canceló por error, lo primero que se pregunta es quién.
-- ───────────────────────────────────────────────────────────────
alter table public.pedido_tienda
  add column preparado_en        timestamptz,
  add column preparado_por       uuid references public.usuario(id),
  add column entregado_en        timestamptz,
  add column entregado_por       uuid references public.usuario(id),
  add column cancelado_en        timestamptz,
  add column cancelado_por       uuid references public.usuario(id),
  add column motivo_cancelacion  text,
  -- Quién dijo «lo revisé» sobre un pedido marcado. Sin esto no se factura.
  add column revisado_en         timestamptz,
  add column revisado_por        uuid references public.usuario(id);

drop policy pedido_tienda_select on public.pedido_tienda;
create policy pedido_tienda_select on public.pedido_tienda
  for select to authenticated
  using ((select app.tiene_permiso('tienda.pedidos'))
      or (select app.tiene_permiso('ventas.ver_todas'))
      or (select app.tiene_permiso('ventas.crear')));


-- ───────────────────────────────────────────────────────────────
-- 3. El reintegro
--
-- Una fila por cada vez que hay que devolverle plata a alguien que
-- pagó en la web: una cancelación, o cada devolución. Queda pendiente
-- hasta que alguien anota que la tienda la devolvió, con la
-- referencia de la pasarela. Es lo que evita que una devolución quede
-- hecha en el sistema y el cliente nunca reciba la plata.
-- ───────────────────────────────────────────────────────────────
create table public.pedido_reintegro (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.pedido_tienda(id),
  motivo         text not null check (motivo in ('cancelacion', 'devolucion')),
  importe        numeric(14,2) not null check (importe > 0),
  devolucion_id  uuid unique references public.devolucion(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid references public.usuario(id),
  hecho_en       timestamptz,
  hecho_por      uuid references public.usuario(id),
  referencia     text,
  actualizado_en timestamptz not null default now()
);

create index pedido_reintegro_pedido_idx on public.pedido_reintegro (pedido_id);
create index pedido_reintegro_pendiente_idx on public.pedido_reintegro (creado_en) where hecho_en is null;

-- Una cancelación devuelve todo una sola vez: dos filas serían el
-- doble de plata.
create unique index pedido_reintegro_una_cancelacion
  on public.pedido_reintegro (pedido_id) where motivo = 'cancelacion';

comment on table public.pedido_reintegro is
  'Plata que la tienda online tiene que devolverle a un comprador que pagó en la web. El sistema no la devuelve: la anota hasta que alguien confirma que se devolvió.';

create trigger pedido_reintegro_actualizado_en
  before update on public.pedido_reintegro
  for each row execute function app.set_actualizado_en();

alter table public.pedido_reintegro enable row level security;

create policy pedido_reintegro_select on public.pedido_reintegro
  for select to authenticated
  using ((select app.tiene_permiso('tienda.pedidos')));

grant select on public.pedido_reintegro to authenticated;

-- Lo que la tienda cobró por este pedido, con su medio de pago. Es lo
-- que se devuelve si se cancela entero.
create or replace function app.cobrado_por_la_tienda(p_pedido_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(vp.importe), 0)
  from public.pedido_tienda p
  join public.canal c on c.id = p.canal_id
  join public.venta_pago vp on vp.venta_id = p.venta_id and vp.medio_pago_id = c.medio_pago_id
  where p.id = p_pedido_id
$$;


-- ───────────────────────────────────────────────────────────────
-- 4. El pedido sigue a su venta
--
-- Si la venta se anula —desde Pedidos o desde Facturación con
-- «Devolver»—, el pedido queda cancelado y, si lo pagó en la web, con
-- su reintegro. Está en un disparador y no en la función de cancelar
-- justamente por el segundo camino: quien anula desde Facturación no
-- sabe que era un pedido web, y el cliente igual tiene que recibir su
-- plata.
--
-- Lo mismo con cada devolución parcial de una venta que se pagó en la
-- web: queda un reintegro por lo que se devolvió.
-- ───────────────────────────────────────────────────────────────
create or replace function app.pedido_sigue_a_la_venta_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_tienda;
  v_cobrado numeric;
begin
  select * into v_pedido from public.pedido_tienda
  where venta_id = new.id and estado <> 'cancelado'
  for update;

  if v_pedido.id is null then
    return new;
  end if;

  update public.pedido_tienda
  set estado = 'cancelado',
      cancelado_en = now(),
      cancelado_por = new.anulada_por,
      motivo_cancelacion = coalesce(motivo_cancelacion, new.motivo_anulacion)
  where id = v_pedido.id;

  if v_pedido.pagado_en_la_web then
    v_cobrado := app.cobrado_por_la_tienda(v_pedido.id);
    if v_cobrado > 0 then
      insert into public.pedido_reintegro (pedido_id, motivo, importe, creado_por)
      values (v_pedido.id, 'cancelacion', v_cobrado, new.anulada_por)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger venta_anulada_cancela_el_pedido
  after update of estado on public.venta
  for each row
  when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function app.pedido_sigue_a_la_venta_anulada();

create or replace function app.devolucion_de_un_pedido_pagado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_tienda;
begin
  select * into v_pedido from public.pedido_tienda where venta_id = new.venta_id;

  if v_pedido.id is not null and v_pedido.pagado_en_la_web and new.total > 0 then
    insert into public.pedido_reintegro (pedido_id, motivo, importe, devolucion_id, creado_por)
    values (v_pedido.id, 'devolucion', new.total, new.id, new.usuario_id);
  end if;

  return new;
end;
$$;

create trigger devolucion_de_un_pedido_pagado
  after insert on public.devolucion
  for each row execute function app.devolucion_de_un_pedido_pagado();


-- ───────────────────────────────────────────────────────────────
-- 5. Los pasos
--
-- Todos pasan por acá y no por un update desde la pantalla: así nadie
-- saltea un paso, y el que importa —no entregar sin factura lo que ya
-- se cobró— lo hace cumplir la base.
-- ───────────────────────────────────────────────────────────────
create or replace function app.pedido_para_atender(p_pedido_id uuid)
returns public.pedido_tienda
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_tienda;
begin
  if not app.tiene_permiso('tienda.pedidos') then
    raise exception 'No tenés permiso para atender los pedidos de la tienda.';
  end if;

  select * into v_pedido from public.pedido_tienda where id = p_pedido_id for update;
  if v_pedido.id is null then
    raise exception 'El pedido no existe.';
  end if;
  return v_pedido;
end;
$$;

create or replace function public.pedido_web_marcar(p_pedido_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_tienda;
  v_venta  public.venta;
begin
  v_pedido := app.pedido_para_atender(p_pedido_id);
  select * into v_venta from public.venta where id = v_pedido.venta_id;

  if v_pedido.estado = 'cancelado' then
    raise exception 'El pedido está cancelado.';
  end if;

  if p_estado = 'preparado' then
    if v_pedido.estado <> 'recibido' then
      raise exception 'Sólo se prepara un pedido recién recibido. Este ya está %.', v_pedido.estado;
    end if;
    update public.pedido_tienda
    set estado = 'preparado', preparado_en = now(), preparado_por = app.usuario_actual_id()
    where id = p_pedido_id;

  elsif p_estado = 'entregado' then
    if v_pedido.estado = 'entregado' then
      raise exception 'El pedido ya estaba entregado.';
    end if;

    /*
      Lo que ya se cobró no sale sin factura. Una factura esperando el
      CAE alcanza —si ARCA no contesta, el paquete no tiene por qué
      esperar—; lo que no alcanza es no haberla emitido.
    */
    if v_pedido.pagado_en_la_web and not exists (
         select 1 from public.comprobante c
         where c.venta_id = v_pedido.venta_id and c.estado <> 'anulado') then
      raise exception 'Falta facturar: el cliente ya pagó en la web y el pedido no puede salir sin factura.';
    end if;

    -- El que paga en el local, paga antes de llevárselo.
    if not v_pedido.pagado_en_la_web and v_venta.estado <> 'cobrada' then
      raise exception 'Todavía no se cobró: el cliente paga en el local, y la caja lo cobra antes de entregarlo.';
    end if;

    update public.pedido_tienda
    set estado = 'entregado', entregado_en = now(), entregado_por = app.usuario_actual_id()
    where id = p_pedido_id;

  else
    raise exception 'Paso desconocido: %.', p_estado;
  end if;
end;
$$;

comment on function public.pedido_web_marcar(uuid, text) is
  'Pasa un pedido de la tienda a preparado o a entregado. No deja entregar sin factura lo que se cobró en la web.';

/*
  Cancelar es anular la venta, por el camino de siempre: si no estaba
  facturada, se anula y el stock vuelve; si lo estaba, además sale la
  nota de crédito. El pedido y el reintegro los resuelve el disparador
  de la venta, que es el mismo que corre si la anulan desde
  Facturación.

  Devuelve la nota de crédito, si hubo, para que la pantalla le pida
  el CAE como en cualquier devolución.
*/
create or replace function public.pedido_web_cancelar(p_pedido_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_tienda;
  v_nota   uuid;
begin
  v_pedido := app.pedido_para_atender(p_pedido_id);

  if not app.tiene_permiso('ventas.anular') then
    raise exception 'No tenés permiso para anular ventas, y cancelar un pedido es anular su venta.';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la cancelación.';
  end if;
  if v_pedido.estado = 'cancelado' then
    raise exception 'El pedido ya estaba cancelado.';
  end if;
  -- Lo entregado vuelve por devolución: el cliente puede devolver una
  -- parte, y la nota de crédito tiene que decir cuál.
  if v_pedido.estado = 'entregado' then
    raise exception 'El pedido ya se entregó: lo que vuelve se registra como devolución.';
  end if;
  if exists (select 1 from public.comprobante c
             where c.venta_id = v_pedido.venta_id
               and c.estado in ('autorizado', 'informado', 'contingencia'))
     and not app.tiene_permiso('facturacion.emitir') then
    raise exception 'El pedido ya está facturado, y cancelarlo emite una nota de crédito: hace falta el permiso para facturar.';
  end if;

  update public.pedido_tienda set motivo_cancelacion = btrim(p_motivo) where id = p_pedido_id;

  v_nota := public.anular_venta_con_nota_credito(v_pedido.venta_id, 'Pedido web cancelado: ' || btrim(p_motivo));
  return v_nota;
end;
$$;

comment on function public.pedido_web_cancelar(uuid, text) is
  'Cancela un pedido de la tienda anulando su venta. Si lo pagó en la web, queda el reintegro pendiente.';

/*
  Facturar un pedido pagado en la web, por el circuito de siempre:
  preparar_comprobante() arma la factura y reserva el número, y la
  pantalla le pide el CAE a ARCA después.

  Dos frenos:
  · Un pedido marcado para revisar no se factura hasta que alguien dice
    que lo revisó, y queda su nombre.
  · Si la factura sale por un importe distinto de lo que el cliente
    pagó, no se factura. Pasa cuando le corresponde percepción de IIBB:
    la factura sumaría algo que la web no cobró. Todo se deshace,
    número incluido, porque el contador está en una tabla y vuelve con
    la transacción.

  Si ya tiene una factura esperando el CAE, devuelve esa: reintentar es
  seguro y no arma otra.
*/
create or replace function public.pedido_web_facturar(p_pedido_id uuid, p_lo_revise boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_tienda;
  v_venta  public.venta;
  v_comp   public.comprobante;
  v_id     uuid;
begin
  v_pedido := app.pedido_para_atender(p_pedido_id);

  if not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para facturar.';
  end if;
  if v_pedido.estado = 'cancelado' then
    raise exception 'El pedido está cancelado.';
  end if;
  if not v_pedido.pagado_en_la_web then
    raise exception 'Este pedido se paga en el local: se factura en la caja, al cobrarlo.';
  end if;

  select * into v_venta from public.venta where id = v_pedido.venta_id;
  if v_venta.estado <> 'cobrada' then
    raise exception 'La venta del pedido no está cobrada (está %).', v_venta.estado;
  end if;

  select * into v_comp from public.comprobante
  where venta_id = v_pedido.venta_id and estado <> 'anulado'
  order by creado_en desc limit 1;

  if v_comp.id is not null then
    if v_comp.estado in ('pendiente', 'rechazado') then
      return v_comp.id;
    end if;
    raise exception 'El pedido ya está facturado.';
  end if;

  if v_pedido.revisar is not null and v_pedido.revisado_en is null then
    if not p_lo_revise then
      raise exception 'Este pedido está marcado para revisar (%). Hay que confirmar que se revisó antes de facturar.', v_pedido.revisar;
    end if;
    update public.pedido_tienda
    set revisado_en = now(), revisado_por = app.usuario_actual_id()
    where id = p_pedido_id;
  end if;

  v_id := public.preparar_comprobante(v_pedido.venta_id);

  select * into v_comp from public.comprobante where id = v_id;
  if v_comp.total <> v_venta.total then
    raise exception 'La factura saldría por $% y el cliente pagó $% en la web. La diferencia es la percepción de IIBB que le corresponde a este cliente: hay que hablarlo con él antes de facturar.',
      to_char(v_comp.total, 'FM999G999G990D00'), to_char(v_venta.total, 'FM999G999G990D00');
  end if;

  return v_id;
end;
$$;

comment on function public.pedido_web_facturar(uuid, boolean) is
  'Arma la factura de un pedido pagado en la web. No factura si difiere de lo cobrado. El CAE se pide después, como siempre.';

create or replace function public.pedido_web_reintegro_hecho(p_reintegro_id uuid, p_referencia text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reintegro public.pedido_reintegro;
begin
  if not app.tiene_permiso('tienda.pedidos') then
    raise exception 'No tenés permiso para atender los pedidos de la tienda.';
  end if;

  select * into v_reintegro from public.pedido_reintegro where id = p_reintegro_id for update;
  if v_reintegro.id is null then
    raise exception 'El reintegro no existe.';
  end if;
  if v_reintegro.hecho_en is not null then
    raise exception 'Ese reintegro ya estaba anotado como devuelto.';
  end if;
  -- Sin referencia no hay forma de encontrarlo en la pasarela si el
  -- cliente dice que no le llegó.
  if p_referencia is null or length(btrim(p_referencia)) < 3 then
    raise exception 'Anotá la referencia del reintegro en la pasarela de pago.';
  end if;

  update public.pedido_reintegro
  set hecho_en = now(), hecho_por = app.usuario_actual_id(), referencia = btrim(p_referencia)
  where id = p_reintegro_id;
end;
$$;


-- ───────────────────────────────────────────────────────────────
-- 6. Lo que ve la pantalla
--
-- Una función y no una vista: la pantalla junta el pedido, la venta,
-- el cliente, la factura, el remito y los reintegros, y cada una de
-- esas tablas tiene su propio permiso de lectura. Con una vista, al
-- encargado al que le falte uno se le vaciaría la lista sin decir por
-- qué. Acá el permiso es uno, tienda.pedidos, y se mira una vez.
-- ───────────────────────────────────────────────────────────────
create or replace function public.pedidos_web(p_vista text)
returns table (
  id                 uuid,
  numero             text,
  estado             text,
  pagado_en_la_web   boolean,
  referencia_pago    text,
  entrega            text,
  domicilio          text,
  localidad          text,
  contacto           text,
  email              text,
  revisar            text,
  revisado_en        timestamptz,
  recibido_en        timestamptz,
  preparado_en       timestamptz,
  entregado_en       timestamptz,
  cancelado_en       timestamptz,
  motivo_cancelacion text,
  venta_id           uuid,
  venta_codigo       text,
  venta_estado       text,
  total              numeric,
  cobrada_en         timestamptz,
  observaciones      text,
  cliente_nombre     text,
  cliente_documento  text,
  comprobante_id     uuid,
  comprobante_estado text,
  comprobante        text,
  remito_id          uuid,
  a_reintegrar       numeric,
  devuelto           numeric,
  lineas             jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('tienda.pedidos') then
    raise exception 'No tenés permiso para atender los pedidos de la tienda.';
  end if;
  if p_vista not in ('por_preparar', 'entregados', 'cancelados') then
    raise exception 'Vista desconocida: %.', p_vista;
  end if;

  return query
  select
    p.id, p.numero_externo, p.estado, p.pagado_en_la_web, p.referencia_pago, p.entrega,
    p.domicilio, p.localidad, p.contacto, p.email, p.revisar, p.revisado_en,
    p.recibido_en, p.preparado_en, p.entregado_en, p.cancelado_en, p.motivo_cancelacion,
    v.id, v.codigo, v.estado, v.total, v.cobrada_en, v.observaciones,
    cl.nombre, cl.numero_documento,
    f.id, f.estado, f.comprobante,
    r.id,
    coalesce((select sum(pr.importe) from public.pedido_reintegro pr
              where pr.pedido_id = p.id and pr.hecho_en is null), 0),
    coalesce((select sum(d.total) from public.devolucion d where d.venta_id = v.id), 0),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'codigo', l.codigo_producto, 'descripcion', l.descripcion,
              'cantidad', l.cantidad, 'precio', l.precio_unitario, 'importe', l.importe)
              order by l.orden), '[]'::jsonb)
     from public.venta_linea l where l.venta_id = v.id)
  from public.pedido_tienda p
  join public.venta v on v.id = p.venta_id
  left join public.cliente cl on cl.id = v.cliente_id
  left join lateral (
    select c.id, c.estado, c.comprobante from public.vista_comprobante_estado c
    where c.venta_id = v.id and c.familia = 'factura' and c.estado <> 'anulado'
    order by c.fecha desc, c.numero desc limit 1
  ) f on true
  left join lateral (
    select n.id from public.comprobante_no_fiscal n
    where n.venta_id = v.id and n.tipo_clave = 'remito' and n.estado <> 'anulado'
    order by n.creado_en desc limit 1
  ) r on true
  where case p_vista
          when 'por_preparar' then p.estado in ('recibido', 'preparado')
          when 'entregados'   then p.estado = 'entregado'
          else p.estado = 'cancelado'
        end
     -- Un cancelado con plata por devolver sigue a la vista en la
     -- primera pestaña: el trabajo no terminó.
     or (p_vista = 'por_preparar' and exists (
           select 1 from public.pedido_reintegro pr
           where pr.pedido_id = p.id and pr.hecho_en is null))
  order by p.recibido_en desc
  limit 300;
end;
$$;

comment on function public.pedidos_web(text) is
  'Lo que muestra la pantalla Pedidos web: el pedido con su venta, factura, remito y reintegros.';

create or replace function public.pedido_web_reintegros(p_pedido_id uuid)
returns setof public.pedido_reintegro
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('tienda.pedidos') then
    raise exception 'No tenés permiso para atender los pedidos de la tienda.';
  end if;
  return query select * from public.pedido_reintegro where pedido_id = p_pedido_id order by creado_en;
end;
$$;

-- Para el número del menú: lo que espera que alguien haga algo.
create or replace function public.pedidos_web_pendientes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.tiene_permiso('tienda.pedidos') then (
    (select count(*) from public.pedido_tienda where estado in ('recibido', 'preparado'))
    + (select count(*) from public.pedido_reintegro where hecho_en is null)
  )::integer else 0 end
$$;


-- ───────────────────────────────────────────────────────────────
-- 7. La tienda pregunta por su pedido
--
-- Lo mínimo para contestarle al comprador: en qué está, si ya tiene
-- factura, y si hay plata para devolverle. Nada del cliente —la
-- tienda ya lo tiene— ni de lo interno.
--
-- «actualizado» es el último cambio de cualquiera de las partes: si la
-- factura sale o se anota un reintegro, la tienda lo tiene que ver
-- moverse aunque el pedido en sí no haya cambiado de estado.
-- ───────────────────────────────────────────────────────────────
create or replace function public.api_tienda_estado_pedido(p_clave text, p_numero text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal  uuid;
  v_pedido public.pedido_tienda;
  v_venta  public.venta;
  v_comp   record;
begin
  v_canal := app.canal_de_la_clave(p_clave);

  select * into v_pedido from public.pedido_tienda
  where canal_id = v_canal and numero_externo = btrim(coalesce(p_numero, ''));

  -- Un pedido de otro canal se contesta igual que uno que no existe.
  if v_pedido.id is null then
    raise exception using errcode = 'PT404', message = 'pedido_desconocido';
  end if;

  select * into v_venta from public.venta where id = v_pedido.venta_id;

  select c.tipo, c.punto_venta, c.numero, c.estado, c.actualizado_en into v_comp
  from (select tc.clase as tipo, pv.numero as punto_venta, co.numero, co.estado, co.actualizado_en, co.creado_en
        from public.comprobante co
        join public.tipo_comprobante tc on tc.id = co.tipo_comprobante_id
        join public.punto_venta pv on pv.id = co.punto_venta_id
        where co.venta_id = v_pedido.venta_id and tc.familia = 'factura' and co.estado <> 'anulado') c
  order by c.creado_en desc limit 1;

  return json_build_object(
    'numero', v_pedido.numero_externo,
    'estado', v_pedido.estado,
    'entrega', v_pedido.entrega,
    'pagado_en_la_web', v_pedido.pagado_en_la_web,
    'cobrado', v_venta.estado = 'cobrada' or (v_venta.estado = 'anulada' and v_venta.cobrada_en is not null),
    'factura', case when v_comp.estado in ('autorizado', 'informado', 'contingencia') then
                 v_comp.tipo || ' ' || lpad(v_comp.punto_venta::text, 5, '0') || '-' || lpad(v_comp.numero::text, 8, '0')
               end,
    'reintegros', coalesce((
       select json_agg(json_build_object(
                'motivo', r.motivo,
                'importe', trim_scale(r.importe),
                'devuelto', r.hecho_en is not null,
                'devuelto_en', r.hecho_en) order by r.creado_en)
       from public.pedido_reintegro r where r.pedido_id = v_pedido.id), '[]'::json),
    'actualizado', greatest(
       v_pedido.actualizado_en,
       v_comp.actualizado_en,
       (select max(r.actualizado_en) from public.pedido_reintegro r where r.pedido_id = v_pedido.id)));
end;
$$;

comment on function public.api_tienda_estado_pedido(text, text) is
  'API de la tienda: en qué está un pedido. Ver docs/api-tienda.md.';


-- ───────────────────────────────────────────────────────────────
-- 8. Permisos de ejecución
-- ───────────────────────────────────────────────────────────────
revoke all on function public.api_tienda_estado_pedido(text, text) from public, authenticated, service_role;
grant execute on function public.api_tienda_estado_pedido(text, text) to anon;

revoke all on function public.pedido_web_marcar(uuid, text) from public, anon;
revoke all on function public.pedido_web_cancelar(uuid, text) from public, anon;
revoke all on function public.pedido_web_facturar(uuid, boolean) from public, anon;
revoke all on function public.pedido_web_reintegro_hecho(uuid, text) from public, anon;
revoke all on function public.pedidos_web(text) from public, anon;
revoke all on function public.pedido_web_reintegros(uuid) from public, anon;
revoke all on function public.pedidos_web_pendientes() from public, anon;
grant execute on function public.pedido_web_marcar(uuid, text) to authenticated;
grant execute on function public.pedido_web_cancelar(uuid, text) to authenticated;
grant execute on function public.pedido_web_facturar(uuid, boolean) to authenticated;
grant execute on function public.pedido_web_reintegro_hecho(uuid, text) to authenticated;
grant execute on function public.pedidos_web(text) to authenticated;
grant execute on function public.pedido_web_reintegros(uuid) to authenticated;
grant execute on function public.pedidos_web_pendientes() to authenticated;

revoke all on function app.cobrado_por_la_tienda(uuid) from public;
revoke all on function app.pedido_para_atender(uuid) from public;
revoke all on function app.pedido_sigue_a_la_venta_anulada() from public;
revoke all on function app.devolucion_de_un_pedido_pagado() from public;
