/*
  ─────────────────────────────────────────────────────────────
  El remito R: las hojas de imprenta

  Fase 03, punto 4. La imprenta entrega las hojas ya numeradas, con el
  CAI; el sistema imprime encima lo que cambia en cada remito. El remito
  en sí sigue siendo el de siempre —es el que baja el stock—: esto agrega
  de qué hoja salió.

  · Una tanda es lo que entregó la imprenta: punto de venta, CAI,
    vencimiento y rango de números.
  · Una hoja es un número de esa tanda ya usado. Se usa en orden; si se
    arruina, queda anotada como arruinada y se pasa a la siguiente, para
    que siempre se pueda explicar cada número de la tanda.
  · Un remito largo puede ocupar más de una hoja.
  ─────────────────────────────────────────────────────────────
*/
create table public.remito_r_tanda (
  id uuid primary key default gen_random_uuid(),
  punto_venta integer not null check (punto_venta between 1 and 99999),
  cai text not null check (cai ~ '^\d{14}$'),
  vencimiento date not null,
  desde bigint not null check (desde > 0),
  hasta bigint not null check (hasta <= 99999999),
  creado_por uuid references public.usuario(id),
  creado_en timestamptz not null default now(),
  check (desde <= hasta)
);

create table public.remito_r_hoja (
  id uuid primary key default gen_random_uuid(),
  tanda_id uuid not null references public.remito_r_tanda(id),
  numero bigint not null,
  -- Sin remito: la hoja se arruinó antes de usarla (se trabó en la impresora, por ejemplo).
  no_fiscal_id uuid references public.comprobante_no_fiscal(id),
  estado text not null default 'usada' check (estado in ('usada', 'arruinada')),
  motivo text,
  creado_por uuid references public.usuario(id),
  creado_en timestamptz not null default now(),
  arruinada_por uuid references public.usuario(id),
  arruinada_en timestamptz,
  unique (tanda_id, numero)
);
create index remito_r_hoja_no_fiscal on public.remito_r_hoja(no_fiscal_id);

alter table public.remito_r_tanda enable row level security;
alter table public.remito_r_hoja enable row level security;
create policy remito_r_tanda_select on public.remito_r_tanda
  for select to authenticated
  using ((select app.tiene_permiso('facturacion.no_fiscal_emitir') or app.tiene_permiso('configuracion.gestionar')));
create policy remito_r_hoja_select on public.remito_r_hoja
  for select to authenticated
  using ((select app.tiene_permiso('facturacion.no_fiscal_emitir') or app.tiene_permiso('configuracion.gestionar')));

-- La próxima hoja de cada tanda: se usan en orden, así que es la que sigue a la última.
create or replace function app.remito_r_proxima(p_tanda uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select max(h.numero) from public.remito_r_hoja h where h.tanda_id = t.id) + 1, t.desde)
  from public.remito_r_tanda t where t.id = p_tanda;
$$;

-- ─── Las tandas ───

create or replace function public.remito_r_tandas()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not (app.tiene_permiso('facturacion.no_fiscal_emitir') or app.tiene_permiso('configuracion.gestionar')) then
    raise exception 'No tenés permiso para ver las hojas del remito R.';
  end if;
  return coalesce((
    select json_agg(x order by x.vigente desc, x.desde)
    from (
      select t.id, t.punto_venta, t.cai, t.vencimiento, t.desde, t.hasta,
             app.remito_r_proxima(t.id) as proxima,
             greatest(0, t.hasta - app.remito_r_proxima(t.id) + 1) as quedan,
             (select count(*) from public.remito_r_hoja h where h.tanda_id = t.id and h.estado = 'usada') as usadas,
             (select count(*) from public.remito_r_hoja h where h.tanda_id = t.id and h.estado = 'arruinada') as arruinadas,
             (t.vencimiento >= v_hoy and app.remito_r_proxima(t.id) <= t.hasta) as vigente
      from public.remito_r_tanda t
    ) x
  ), '[]'::json);
end;
$$;

create or replace function public.remito_r_guardar_tanda(
  p_punto_venta integer, p_cai text, p_vencimiento date, p_desde bigint, p_hasta bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para cargar las hojas del remito R.';
  end if;
  if p_cai is null or btrim(p_cai) !~ '^\d{14}$' then
    raise exception 'El CAI son 14 números.';
  end if;
  if p_punto_venta is null or p_punto_venta < 1 then
    raise exception 'Falta el punto de venta.';
  end if;
  if p_vencimiento is null then
    raise exception 'Falta el vencimiento del CAI.';
  end if;
  if p_desde is null or p_hasta is null or p_desde < 1 or p_desde > p_hasta then
    raise exception 'El número «desde» va antes que el «hasta».';
  end if;
  if exists (
    select 1 from public.remito_r_tanda t
    where t.punto_venta = p_punto_venta and p_desde <= t.hasta and p_hasta >= t.desde
  ) then
    raise exception 'Esos números ya están en otra tanda de ese punto de venta.';
  end if;

  insert into public.remito_r_tanda (punto_venta, cai, vencimiento, desde, hasta, creado_por)
  values (p_punto_venta, btrim(p_cai), p_vencimiento, p_desde, p_hasta, app.usuario_actual_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- Sólo para corregir un error de carga: con una hoja usada, la tanda ya es historia.
create or replace function public.remito_r_borrar_tanda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para cargar las hojas del remito R.';
  end if;
  if exists (select 1 from public.remito_r_hoja h where h.tanda_id = p_id) then
    raise exception 'Esa tanda ya tiene hojas usadas: no se puede borrar.';
  end if;
  delete from public.remito_r_tanda where id = p_id;
end;
$$;

-- ─── Las hojas de un remito ───

create or replace function public.remito_r_de_remito(p_no_fiscal uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venta uuid;
begin
  if not app.tiene_permiso('facturacion.no_fiscal_emitir') then
    raise exception 'No tenés permiso para imprimir el remito R.';
  end if;
  select n.venta_id into v_venta from public.comprobante_no_fiscal n where n.id = p_no_fiscal;

  return json_build_object(
    'hojas', coalesce((
      select json_agg(json_build_object(
               'id', h.id, 'numero', h.numero, 'punto_venta', t.punto_venta,
               'cai', t.cai, 'vencimiento', t.vencimiento)
             order by h.creado_en, h.numero)
      from public.remito_r_hoja h
      join public.remito_r_tanda t on t.id = h.tanda_id
      where h.no_fiscal_id = p_no_fiscal and h.estado = 'usada'
    ), '[]'::json),
    'pedido_numero', (
      select pm.numero from public.pedido_mayorista pm
      where v_venta is not null and pm.venta_id = v_venta
      order by pm.recibido_en desc limit 1
    ),
    -- La factura de esa venta o, si no hay, su proforma.
    'asociado', coalesce((
      select lpad(pv.numero::text, 4, '0') || '-' || lpad(co.numero::text, 8, '0')
      from public.comprobante co
      left join public.punto_venta pv on pv.id = co.punto_venta_id
      where v_venta is not null and co.venta_id = v_venta and co.estado <> 'anulado'
      order by co.creado_en desc limit 1
    ), (
      select n.serie || '-' || lpad(n.numero::text, 8, '0')
      from public.comprobante_no_fiscal n
      where v_venta is not null and n.venta_id = v_venta
        and n.tipo_clave = 'comprobante_interno' and n.anulado_en is null
      order by n.creado_en desc limit 1
    ))
  );
end;
$$;

/*
  Toma las hojas que le falten al remito, en orden: las que ya tiene no
  se vuelven a tomar, así imprimir de nuevo no gasta números. No deja
  pasar del último número ni del vencimiento.
*/
create or replace function public.remito_r_tomar_hojas(p_no_fiscal uuid, p_cantidad integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_tiene integer;
  v_tanda uuid;
begin
  if not app.tiene_permiso('facturacion.no_fiscal_emitir') then
    raise exception 'No tenés permiso para imprimir el remito R.';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 50 then
    raise exception 'No se entiende cuántas hojas lleva el remito.';
  end if;
  if not exists (
    select 1 from public.comprobante_no_fiscal n
    where n.id = p_no_fiscal and n.tipo_clave = 'remito' and n.anulado_en is null
  ) then
    raise exception 'Ese remito no existe o está anulado.';
  end if;

  select count(*) into v_tiene from public.remito_r_hoja h
  where h.no_fiscal_id = p_no_fiscal and h.estado = 'usada';

  for i in 1 .. p_cantidad - v_tiene loop
    -- Bloquea la tanda: dos personas imprimiendo a la vez no toman el mismo número.
    select t.id into v_tanda
    from public.remito_r_tanda t
    where t.vencimiento >= v_hoy and app.remito_r_proxima(t.id) <= t.hasta
    order by t.vencimiento, t.desde
    limit 1
    for update;
    if v_tanda is null then
      raise exception 'No quedan hojas de remito R con el CAI vigente. Cargá la tanda nueva en Configuración.';
    end if;
    insert into public.remito_r_hoja (tanda_id, numero, no_fiscal_id, creado_por)
    values (v_tanda, app.remito_r_proxima(v_tanda), p_no_fiscal, app.usuario_actual_id());
  end loop;
end;
$$;

/*
  Una hoja que no sirvió. Con id, la de un remito: el remito tomará la
  siguiente al imprimir de nuevo. Sin id, la próxima de la pila, que se
  arruinó antes de usarla.
*/
create or replace function public.remito_r_arruinar_hoja(p_hoja uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_tanda uuid;
begin
  if not app.tiene_permiso('facturacion.no_fiscal_emitir') then
    raise exception 'No tenés permiso para imprimir el remito R.';
  end if;

  if p_hoja is not null then
    update public.remito_r_hoja
    set estado = 'arruinada', motivo = nullif(btrim(p_motivo), ''),
        arruinada_por = app.usuario_actual_id(), arruinada_en = now()
    where id = p_hoja and estado = 'usada';
    if not found then
      raise exception 'Esa hoja ya no está en uso.';
    end if;
    return;
  end if;

  select t.id into v_tanda
  from public.remito_r_tanda t
  where t.vencimiento >= v_hoy and app.remito_r_proxima(t.id) <= t.hasta
  order by t.vencimiento, t.desde
  limit 1
  for update;
  if v_tanda is null then
    raise exception 'No quedan hojas de remito R con el CAI vigente.';
  end if;
  insert into public.remito_r_hoja (tanda_id, numero, estado, motivo, creado_por, arruinada_por, arruinada_en)
  values (v_tanda, app.remito_r_proxima(v_tanda), 'arruinada', nullif(btrim(p_motivo), ''),
          app.usuario_actual_id(), app.usuario_actual_id(), now());
end;
$$;

revoke all on function app.remito_r_proxima(uuid) from public, anon;
revoke all on function public.remito_r_tandas(), public.remito_r_guardar_tanda(integer, text, date, bigint, bigint),
  public.remito_r_borrar_tanda(uuid), public.remito_r_de_remito(uuid),
  public.remito_r_tomar_hojas(uuid, integer), public.remito_r_arruinar_hoja(uuid, text) from public, anon;
grant execute on function app.remito_r_proxima(uuid) to authenticated, service_role;
grant execute on function public.remito_r_tandas(), public.remito_r_guardar_tanda(integer, text, date, bigint, bigint),
  public.remito_r_borrar_tanda(uuid), public.remito_r_de_remito(uuid),
  public.remito_r_tomar_hojas(uuid, integer), public.remito_r_arruinar_hoja(uuid, text) to authenticated, service_role;
