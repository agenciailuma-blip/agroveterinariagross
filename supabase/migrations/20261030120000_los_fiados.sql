/*
  ─────────────────────────────────────────────────────────────
  Los fiados

  Fase 03, punto 7. No es cuenta corriente, y Lucas insiste por algo
  concreto: cargarlo como cuenta corriente le llena el listado de cuentas
  de gente que vino una vez con el perro chocado. Es otro registro, con
  su propia pantalla, y no da de alta un cliente.

  ─── CÓMO ENTRA ───

  Por la caja, como cualquier venta —ticket, stock, todo—, con un medio
  de pago nuevo, «Fiado», que pide DNI, nombre, domicilio, teléfono y la
  fecha en que va a pagar. Esos datos viajan con el pago
  (venta_pago.datos_fiado), igual que los del cheque, y el fiado de
  verdad lo arma la base al cobrarse la venta. Así anda también sin
  conexión: la caja lo guarda y sube cuando vuelve internet.

  ─── LA CUENTA DE CADA PERSONA ───

  · fiado_persona: la ficha, una por DNI.
  · fiado: cada venta fiada, por lo que quedó debiendo.
  · fiado_vencimiento: el cronograma —«el 15 una entrega, el 18 otra»—.
    Cambiarlo no borra nada: las fechas viejas quedan como historia,
    con quién y por qué las cambió.
  · fiado_pago: cada pago, con su recibo —el mismo talonario de la
    cuenta corriente— y lo que entró a la caja. Se imputa a las ventas
    fiadas más viejas, o a la que se elija.

  ─── LO VENCIDO ───

  Un cronograma cubre lo que faltaba pagar cuando se fijó. Lo vencido
  es lo que el cronograma pedía hasta ayer menos lo que se pagó desde
  entonces; la próxima fecha, la primera que lo pagado todavía no
  cubre.

  El DNI, el domicilio y el teléfono son de personas que no son
  clientes: un registro del negocio sobre su propia deuda, que no se
  comparte con otros comercios.
  ─────────────────────────────────────────────────────────────
*/

-- ── Permisos ────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('fiados.ver',    'Fiados', 'Ver los fiados y el aviso de quien ya debe', 550),
  ('fiados.cobrar', 'Fiados', 'Cobrar fiados, cambiar sus fechas y corregir la ficha', 551)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r
cross join (values ('fiados.ver'), ('fiados.cobrar')) as p(clave)
where r.nombre in ('Administrador', 'Encargado', 'Cajero') and r.eliminado_en is null
on conflict do nothing;

-- El vendedor ve el aviso en el mostrador.
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'fiados.ver'
from public.rol r
where r.nombre = 'Vendedor' and r.eliminado_en is null
on conflict do nothing;

-- ── El medio de pago ────────────────────────────────────────────
alter table public.medio_pago drop constraint medio_pago_tipo_check;
alter table public.medio_pago add constraint medio_pago_tipo_check check (tipo in (
  'efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'cuenta_corriente', 'cheque', 'fiado', 'otro'
));

insert into public.medio_pago (nombre, tipo, afecta_caja, orden)
select 'Fiado', 'fiado', false, 55
where not exists (select 1 from public.medio_pago where tipo = 'fiado' and eliminado_en is null);

alter table public.venta_pago add column datos_fiado jsonb;

comment on column public.venta_pago.datos_fiado is
  'DNI, nombre, domicilio, teléfono y fecha de pago, cuando se paga con Fiado. Al cobrarse la venta se vuelve un fiado de esa persona.';

-- ── La ficha ────────────────────────────────────────────────────
create table public.fiado_persona (
  id              uuid primary key default gen_random_uuid(),
  documento       text not null unique check (documento ~ '^\d{6,9}$'),
  nombre          text not null check (length(btrim(nombre)) between 1 and 120),
  domicilio       text,
  telefono        text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid references public.usuario(id),
  actualizado_en  timestamptz not null default now()
);

comment on table public.fiado_persona is
  'La ficha de quien se lleva fiado: una por DNI. No es un cliente.';

-- ── Cada venta fiada ────────────────────────────────────────────
create table public.fiado (
  id                uuid primary key default gen_random_uuid(),
  persona_id        uuid not null references public.fiado_persona(id),
  venta_id          uuid not null references public.venta(id),
  venta_pago_id     uuid not null unique references public.venta_pago(id),
  importe           numeric(14, 2) not null check (importe > 0),
  fecha             date not null default app.hoy_en_obera(),
  registrado_por    uuid references public.usuario(id),
  creado_en         timestamptz not null default now(),
  anulado_en        timestamptz,
  motivo_anulacion  text
);

create index fiado_persona_idx on public.fiado (persona_id, fecha);

-- ── El cronograma ───────────────────────────────────────────────
create table public.fiado_vencimiento (
  id               uuid primary key default gen_random_uuid(),
  fiado_id         uuid not null references public.fiado(id),
  fecha            date not null,
  importe          numeric(14, 2) not null check (importe > 0),
  -- Todas las fechas de un mismo cronograma comparten este momento.
  fijado_en        timestamptz not null default now(),
  fijado_por       uuid references public.usuario(id),
  motivo           text,
  reemplazado_en   timestamptz
);

create index fiado_vencimiento_fiado_idx on public.fiado_vencimiento (fiado_id) where reemplazado_en is null;

comment on table public.fiado_vencimiento is
  'El cronograma de pago de un fiado. Al cambiarlo, las fechas anteriores quedan con reemplazado_en: son la historia.';

-- ── Los pagos ───────────────────────────────────────────────────
create table public.fiado_pago (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references public.fiado_persona(id),
  fecha           date not null default app.hoy_en_obera(),
  importe         numeric(14, 2) not null check (importe > 0),
  medio_pago_id   uuid not null references public.medio_pago(id),
  caja_id         uuid references public.caja(id),
  usuario_id      uuid references public.usuario(id),
  creado_en       timestamptz not null default now()
);

create index fiado_pago_persona_idx on public.fiado_pago (persona_id, creado_en desc);

create table public.fiado_imputacion (
  pago_id   uuid not null references public.fiado_pago(id) on delete cascade,
  fiado_id  uuid not null references public.fiado(id),
  importe   numeric(14, 2) not null check (importe > 0),
  primary key (pago_id, fiado_id)
);

create index fiado_imputacion_fiado_idx on public.fiado_imputacion (fiado_id);

alter table public.fiado_persona enable row level security;
alter table public.fiado enable row level security;
alter table public.fiado_vencimiento enable row level security;
alter table public.fiado_pago enable row level security;
alter table public.fiado_imputacion enable row level security;

create policy fiado_persona_select on public.fiado_persona
  for select to authenticated using ((select app.tiene_permiso('fiados.ver')));
create policy fiado_select on public.fiado
  for select to authenticated using ((select app.tiene_permiso('fiados.ver')));
create policy fiado_vencimiento_select on public.fiado_vencimiento
  for select to authenticated using ((select app.tiene_permiso('fiados.ver')));
create policy fiado_pago_select on public.fiado_pago
  for select to authenticated using ((select app.tiene_permiso('fiados.ver')));
create policy fiado_imputacion_select on public.fiado_imputacion
  for select to authenticated using ((select app.tiene_permiso('fiados.ver')));

grant select on public.fiado_persona, public.fiado, public.fiado_vencimiento,
  public.fiado_pago, public.fiado_imputacion to authenticated;

-- ── El recibo también es de un fiado ────────────────────────────
alter table public.recibo alter column cliente_id drop not null;
alter table public.recibo add column fiado_persona_id uuid references public.fiado_persona(id);
alter table public.recibo add constraint recibo_de_cliente_o_fiado
  check (num_nonnulls(cliente_id, fiado_persona_id) = 1);
create index recibo_fiado_idx on public.recibo (fiado_persona_id, emitido_en desc) where fiado_persona_id is not null;

alter table public.recibo_pago alter column movimiento_id drop not null;
alter table public.recibo_pago add column fiado_pago_id uuid references public.fiado_pago(id);
alter table public.recibo_pago add constraint recibo_pago_de_cuenta_o_fiado
  check (num_nonnulls(movimiento_id, fiado_pago_id) = 1);

-- ── Cuánto debe cada venta fiada ────────────────────────────────
/*
  Una fila por fiado, con lo que debe, lo vencido hoy y la próxima
  fecha. Es la cuenta de la cabecera, hecha en un solo lugar: la usan
  la pantalla, la ficha y el aviso.
*/
create or replace function app.estado_de_fiados(p_persona_id uuid default null)
returns table (
  fiado_id uuid, persona_id uuid, importe numeric, pagado numeric, saldo numeric,
  vencido numeric, proxima_fecha date, proximo_importe numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select f.id, f.persona_id, f.importe,
           coalesce((select sum(i.importe) from public.fiado_imputacion i where i.fiado_id = f.id), 0) as pagado
    from public.fiado f
    where f.anulado_en is null and (p_persona_id is null or f.persona_id = p_persona_id)
  ),
  cron as (
    select v.fiado_id, v.fecha, v.importe, v.fijado_en, v.id,
           sum(v.importe) over (partition by v.fiado_id order by v.fecha, v.id) as acumulado
    from public.fiado_vencimiento v
    join f on f.id = v.fiado_id
    where v.reemplazado_en is null
  ),
  -- Lo pagado desde que se fijó el cronograma vigente.
  desde as (
    select f.id as fiado_id,
           coalesce((select sum(i.importe) from public.fiado_imputacion i
                     join public.fiado_pago p on p.id = i.pago_id
                     where i.fiado_id = f.id
                       and p.creado_en >= (select min(c.fijado_en) from cron c where c.fiado_id = f.id)), 0) as pagado
    from f
  )
  select f.id, f.persona_id, f.importe, f.pagado, f.importe - f.pagado,
         case when f.importe - f.pagado <= 0 then 0
              else least(f.importe - f.pagado, greatest(0,
                coalesce((select max(c.acumulado) from cron c
                          where c.fiado_id = f.id and c.fecha < app.hoy_en_obera()), 0) - d.pagado)) end,
         case when f.importe - f.pagado > 0 then
           (select min(c.fecha) from cron c where c.fiado_id = f.id and c.acumulado > d.pagado + 0.009) end,
         case when f.importe - f.pagado > 0 then
           (select least(c.acumulado - d.pagado, f.importe - f.pagado) from cron c
            where c.fiado_id = f.id and c.acumulado > d.pagado + 0.009
            order by c.fecha, c.id limit 1) end
  from f
  join desde d on d.fiado_id = f.id;
$$;

revoke execute on function app.estado_de_fiados(uuid) from public, anon;

-- ── La venta cobrada con Fiado ──────────────────────────────────
/*
  Como el cheque: cuando la venta queda cobrada, cada pago con Fiado se
  vuelve un fiado de esa persona. A diferencia del cheque, sin DNI no
  entra: una deuda sin a quién cobrársela se pierde. La caja ya lo pide
  antes de cobrar, con conexión o sin ella.
*/
create or replace function app.fiados_de_la_venta_cobrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy      date := app.hoy_en_obera();
  v_pago     record;
  v_doc      text;
  v_nombre   text;
  v_persona  uuid;
  v_fiado    uuid;
  v_vence    date;
begin
  for v_pago in
    select vp.id, vp.importe, vp.datos_fiado as d
    from public.venta_pago vp
    join public.medio_pago mp on mp.id = vp.medio_pago_id
    where vp.venta_id = new.id and mp.tipo = 'fiado'
  loop
    v_doc := regexp_replace(coalesce(v_pago.d->>'documento', ''), '\D', '', 'g');
    v_nombre := nullif(btrim(coalesce(v_pago.d->>'nombre', '')), '');
    if v_doc !~ '^\d{6,9}$' then
      raise exception 'La venta % va fiada y falta el DNI de quien se la lleva.', new.codigo;
    end if;

    select id into v_persona from public.fiado_persona where documento = v_doc for update;
    if v_persona is null then
      if v_nombre is null then
        raise exception 'La venta % va fiada y falta el nombre de quien se la lleva.', new.codigo;
      end if;
      insert into public.fiado_persona (documento, nombre, domicilio, telefono, creado_por)
      values (v_doc, v_nombre,
              nullif(btrim(coalesce(v_pago.d->>'domicilio', '')), ''),
              nullif(btrim(coalesce(v_pago.d->>'telefono', '')), ''),
              new.cajero_id)
      returning id into v_persona;
    else
      -- Lo que se escribió ahora es lo más nuevo; lo que se dejó en blanco no borra nada.
      update public.fiado_persona
      set nombre    = coalesce(v_nombre, nombre),
          domicilio = coalesce(nullif(btrim(coalesce(v_pago.d->>'domicilio', '')), ''), domicilio),
          telefono  = coalesce(nullif(btrim(coalesce(v_pago.d->>'telefono', '')), ''), telefono),
          actualizado_en = now()
      where id = v_persona;
    end if;

    insert into public.fiado (persona_id, venta_id, venta_pago_id, importe, fecha, registrado_por)
    values (v_persona, new.id, v_pago.id, round(v_pago.importe, 2), v_hoy, new.cajero_id)
    on conflict (venta_pago_id) do nothing
    returning id into v_fiado;

    if v_fiado is not null then
      v_vence := greatest(coalesce(app.fecha_o_nulo(v_pago.d->>'vence'), v_hoy + 30), v_hoy);
      insert into public.fiado_vencimiento (fiado_id, fecha, importe, fijado_por)
      values (v_fiado, v_vence, round(v_pago.importe, 2), new.cajero_id);
    end if;
  end loop;

  return null;
end;
$$;

create trigger venta_cobrada_deja_sus_fiados
  after update of estado on public.venta
  for each row
  when (new.estado = 'cobrada' and old.estado is distinct from 'cobrada')
  execute function app.fiados_de_la_venta_cobrada();

/* Se anula la venta: el fiado se anula con ella. Lo que ya pagó queda a su favor. */
create or replace function app.fiados_de_la_venta_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fiado
  set anulado_en = now(), motivo_anulacion = 'Se anuló la venta ' || new.codigo
  where venta_id = new.id and anulado_en is null;
  return null;
end;
$$;

create trigger venta_anulada_anula_sus_fiados
  after update of estado on public.venta
  for each row
  when (new.estado = 'anulada' and old.estado = 'cobrada')
  execute function app.fiados_de_la_venta_anulada();

-- ── El aviso de reincidencia ────────────────────────────────────
/*
  Al cargar un DNI —en la caja o en el mostrador—: si ya tuvo un fiado,
  quién es, cuánto debe, cuánto de eso está vencido y cuánto debió en
  total. Trae también la ficha, para no volver a escribirla.
*/
create or replace function public.fiado_aviso(p_documento text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc     text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_persona public.fiado_persona;
begin
  if not app.tiene_permiso('fiados.ver') then
    raise exception 'No tenés permiso para ver los fiados.';
  end if;
  if v_doc !~ '^\d{6,9}$' then
    return null;
  end if;

  select * into v_persona from public.fiado_persona where documento = v_doc;
  if v_persona.id is null then
    return null;
  end if;

  return (
    select json_build_object(
      'persona_id', v_persona.id, 'documento', v_persona.documento, 'nombre', v_persona.nombre,
      'domicilio', v_persona.domicilio, 'telefono', v_persona.telefono,
      'debe', coalesce(sum(e.saldo), 0) - coalesce((
         -- Lo pagado de ventas que después se anularon queda a su favor.
         select sum(i.importe) from public.fiado_imputacion i
         join public.fiado f on f.id = i.fiado_id
         where f.persona_id = v_persona.id and f.anulado_en is not null), 0),
      'vencido', coalesce(sum(e.vencido), 0),
      'fiados', (select count(*) from public.fiado f where f.persona_id = v_persona.id and f.anulado_en is null),
      'fiado_total', (select coalesce(sum(f.importe), 0) from public.fiado f
                      where f.persona_id = v_persona.id and f.anulado_en is null),
      'ultimo', (select max(f.fecha) from public.fiado f where f.persona_id = v_persona.id and f.anulado_en is null))
    from app.estado_de_fiados(v_persona.id) e
  );
end;
$$;

grant execute on function public.fiado_aviso(text) to authenticated;

-- ── La pantalla: una fila por persona ───────────────────────────
create or replace function public.listar_fiados(p_texto text default null, p_todos boolean default false)
returns table (
  persona_id uuid, documento text, nombre text, domicilio text, telefono text,
  debe numeric, vencido numeric, proxima_fecha date, proximo_importe numeric,
  primer_vencimiento date, fiados bigint, ultimo date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_digitos text := nullif(regexp_replace(coalesce(p_texto, ''), '\D', '', 'g'), '');
begin
  if not app.tiene_permiso('fiados.ver') then
    raise exception 'No tenés permiso para ver los fiados.';
  end if;

  return query
  with e as (select * from app.estado_de_fiados(null)),
  por_persona as (
    select e.persona_id,
           sum(e.saldo) as debe,
           sum(e.vencido) as vencido,
           min(e.proxima_fecha) as proxima_fecha,
           count(*) as fiados
    from e group by e.persona_id
  )
  select p.id, p.documento, p.nombre, p.domicilio, p.telefono,
         coalesce(pp.debe, 0), coalesce(pp.vencido, 0), pp.proxima_fecha,
         (select sum(e.proximo_importe) from e
          where e.persona_id = p.id and e.proxima_fecha = pp.proxima_fecha),
         -- La fecha más vieja que quedó sin pagar: ordena lo vencido.
         (select min(e.proxima_fecha) from e where e.persona_id = p.id and e.vencido > 0),
         coalesce(pp.fiados, 0),
         (select max(f.fecha) from public.fiado f where f.persona_id = p.id and f.anulado_en is null)
  from public.fiado_persona p
  left join por_persona pp on pp.persona_id = p.id
  where (p_todos or coalesce(pp.debe, 0) > 0.009 or v_texto is not null)
    and (v_texto is null
         or p.nombre ilike '%' || v_texto || '%'
         or (v_digitos is not null and p.documento like '%' || v_digitos || '%'))
  order by (coalesce(pp.vencido, 0) > 0.009) desc,
           (select min(e.proxima_fecha) from e where e.persona_id = p.id and e.vencido > 0) nulls last,
           pp.proxima_fecha nulls last,
           p.nombre;
end;
$$;

grant execute on function public.listar_fiados(text, boolean) to authenticated;

-- ── La cuenta de una persona ────────────────────────────────────
create or replace function public.fiado_ficha(p_persona_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_persona public.fiado_persona;
begin
  if not app.tiene_permiso('fiados.ver') then
    raise exception 'No tenés permiso para ver los fiados.';
  end if;
  select * into v_persona from public.fiado_persona where id = p_persona_id;
  if v_persona.id is null then
    raise exception 'No se encontró el fiado.';
  end if;

  return json_build_object(
    'id', v_persona.id, 'documento', v_persona.documento, 'nombre', v_persona.nombre,
    'domicilio', v_persona.domicilio, 'telefono', v_persona.telefono, 'creado_en', v_persona.creado_en,
    'fiados', coalesce((
      select json_agg(json_build_object(
        'id', f.id, 'fecha', f.fecha, 'importe', f.importe,
        'venta_id', v.id, 'venta_codigo', v.codigo,
        'registrado_por', u.nombre,
        'anulado_en', f.anulado_en, 'motivo_anulacion', f.motivo_anulacion,
        'pagado', coalesce(e.pagado, (select coalesce(sum(i.importe), 0) from public.fiado_imputacion i where i.fiado_id = f.id)),
        'saldo', coalesce(e.saldo, 0), 'vencido', coalesce(e.vencido, 0),
        'proxima_fecha', e.proxima_fecha, 'proximo_importe', e.proximo_importe,
        'renglones', coalesce((
          select json_agg(json_build_object('descripcion', l.descripcion, 'cantidad', l.cantidad,
                                            'precio_unitario', l.precio_unitario) order by l.orden)
          from public.venta_linea l where l.venta_id = v.id), '[]'::json),
        'cronograma', coalesce((
          select json_agg(json_build_object('fecha', c.fecha, 'importe', c.importe) order by c.fecha, c.id)
          from public.fiado_vencimiento c where c.fiado_id = f.id and c.reemplazado_en is null), '[]'::json),
        'historia', coalesce((
          select json_agg(json_build_object('fecha', c.fecha, 'importe', c.importe, 'fijado_en', c.fijado_en,
                                            'fijado_por', uc.nombre, 'motivo', c.motivo,
                                            'reemplazado_en', c.reemplazado_en)
                          order by c.fijado_en desc, c.fecha)
          from public.fiado_vencimiento c
          left join public.usuario uc on uc.id = c.fijado_por
          where c.fiado_id = f.id), '[]'::json),
        'pagos', coalesce((
          select json_agg(json_build_object('fecha', p.fecha, 'importe', i.importe, 'cobro', up.nombre,
                                            'recibo_id', r.id, 'recibo_serie', r.serie, 'recibo_numero', r.numero)
                          order by p.creado_en)
          from public.fiado_imputacion i
          join public.fiado_pago p on p.id = i.pago_id
          left join public.usuario up on up.id = p.usuario_id
          left join public.recibo_pago rp on rp.fiado_pago_id = p.id
          left join public.recibo r on r.id = rp.recibo_id
          where i.fiado_id = f.id), '[]'::json)
      ) order by f.fecha desc, f.creado_en desc)
      from public.fiado f
      join public.venta v on v.id = f.venta_id
      left join public.usuario u on u.id = f.registrado_por
      left join app.estado_de_fiados(v_persona.id) e on e.fiado_id = f.id
      where f.persona_id = v_persona.id), '[]'::json),
    'pagos', coalesce((
      select json_agg(json_build_object('id', p.id, 'fecha', p.fecha, 'importe', p.importe, 'medio', mp.nombre,
                                        'cobro', up.nombre, 'creado_en', p.creado_en,
                                        'recibo_id', r.id, 'recibo_serie', r.serie, 'recibo_numero', r.numero)
                      order by p.creado_en desc)
      from public.fiado_pago p
      join public.medio_pago mp on mp.id = p.medio_pago_id
      left join public.usuario up on up.id = p.usuario_id
      left join public.recibo_pago rp on rp.fiado_pago_id = p.id
      left join public.recibo r on r.id = rp.recibo_id
      where p.persona_id = v_persona.id), '[]'::json)
  );
end;
$$;

grant execute on function public.fiado_ficha(uuid) to authenticated;

-- ── Corregir la ficha ───────────────────────────────────────────
create or replace function public.fiado_guardar_ficha(
  p_persona_id uuid, p_nombre text, p_domicilio text, p_telefono text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('fiados.cobrar') then
    raise exception 'No tenés permiso para corregir la ficha de un fiado.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre.';
  end if;
  update public.fiado_persona
  set nombre = btrim(p_nombre),
      domicilio = nullif(btrim(coalesce(p_domicilio, '')), ''),
      telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
      actualizado_en = now()
  where id = p_persona_id;
  if not found then
    raise exception 'No se encontró el fiado.';
  end if;
end;
$$;

grant execute on function public.fiado_guardar_ficha(uuid, text, text, text) to authenticated;

-- ── Cambiar las fechas ──────────────────────────────────────────
/*
  El cronograma nuevo cubre lo que falta pagar hoy: las fechas tienen
  que sumar eso, ni más ni menos. Las de antes quedan como historia.
*/
create or replace function public.fiado_fijar_cronograma(p_fiado_id uuid, p_cuotas jsonb, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fiado public.fiado;
  v_saldo numeric;
  v_suma  numeric;
  v_hoy   date := app.hoy_en_obera();
  v_ahora timestamptz := now();
  v_usuario uuid := app.usuario_actual_id();
begin
  if not app.tiene_permiso('fiados.cobrar') then
    raise exception 'No tenés permiso para cambiar las fechas de un fiado.';
  end if;

  select * into v_fiado from public.fiado where id = p_fiado_id for update;
  if v_fiado.id is null then
    raise exception 'No se encontró el fiado.';
  end if;
  if v_fiado.anulado_en is not null then
    raise exception 'Ese fiado está anulado.';
  end if;

  select saldo into v_saldo from app.estado_de_fiados(v_fiado.persona_id) where fiado_id = v_fiado.id;
  if coalesce(v_saldo, 0) <= 0 then
    raise exception 'Ese fiado ya está pagado.';
  end if;

  if jsonb_typeof(p_cuotas) is distinct from 'array' or jsonb_array_length(p_cuotas) = 0 then
    raise exception 'Falta al menos una fecha.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_cuotas) c
             where app.fecha_o_nulo(c->>'fecha') is null
                or coalesce((c->>'importe')::numeric, 0) <= 0) then
    raise exception 'Cada fecha lleva su día y un importe mayor que cero.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_cuotas) c where app.fecha_o_nulo(c->>'fecha') < v_hoy) then
    raise exception 'Las fechas nuevas no pueden ser anteriores a hoy.';
  end if;

  select round(sum((c->>'importe')::numeric), 2) into v_suma from jsonb_array_elements(p_cuotas) c;
  if abs(v_suma - v_saldo) > 0.01 then
    raise exception 'Las fechas suman % y falta pagar %.', app.pesos(v_suma), app.pesos(v_saldo);
  end if;

  update public.fiado_vencimiento set reemplazado_en = v_ahora
  where fiado_id = v_fiado.id and reemplazado_en is null;

  insert into public.fiado_vencimiento (fiado_id, fecha, importe, fijado_en, fijado_por, motivo)
  select v_fiado.id, app.fecha_o_nulo(c->>'fecha'), round((c->>'importe')::numeric, 2), v_ahora, v_usuario,
         nullif(btrim(coalesce(p_motivo, '')), '')
  from jsonb_array_elements(p_cuotas) c;
end;
$$;

grant execute on function public.fiado_fijar_cronograma(uuid, jsonb, text) to authenticated;

-- ── Cobrar ──────────────────────────────────────────────────────
/*
  Un pago, con su recibo. Va a la venta fiada que se elija o, si no, a
  las más viejas primero. No se cobra más de lo que debe.

  El identificador lo pone la pantalla y es el del recibo: si se corta
  la conexión después de grabar y se aprieta de nuevo, contesta el mismo
  recibo en vez de cobrar dos veces.
*/
create or replace function public.cobrar_fiado(
  p_id            uuid,
  p_persona_id    uuid,
  p_medio_pago_id uuid,
  p_importe       numeric,
  p_caja_id       uuid default null,
  p_fiado_id      uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.recibo;
  v_persona   public.fiado_persona;
  v_medio     public.medio_pago;
  v_usuario   uuid := app.usuario_actual_id();
  v_importe   numeric(14, 2) := round(p_importe, 2);
  v_debe      numeric;
  v_resta     numeric;
  v_pago      uuid := gen_random_uuid();
  v_serie     text := '0001';
  v_numero    bigint;
  v_estado    text;
  v_f         record;
  v_parte     numeric;
  v_concepto  text;
begin
  if not app.tiene_permiso('fiados.cobrar') then
    raise exception 'No tenés permiso para cobrar fiados.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del recibo.';
  end if;

  select * into v_existente from public.recibo where id = p_id;
  if v_existente.id is not null then
    return json_build_object('id', v_existente.id, 'serie', v_existente.serie,
                             'numero', v_existente.numero, 'total', v_existente.total, 'repetido', true);
  end if;

  select * into v_persona from public.fiado_persona where id = p_persona_id for update;
  if v_persona.id is null then
    raise exception 'No se encontró el fiado.';
  end if;
  if v_importe is null or v_importe <= 0 then
    raise exception 'El importe tiene que ser mayor que cero.';
  end if;

  select * into v_medio from public.medio_pago where id = p_medio_pago_id and eliminado_en is null and activo;
  if v_medio.id is null then
    raise exception 'El medio de pago no existe o está inactivo.';
  end if;
  if v_medio.tipo in ('fiado', 'cuenta_corriente', 'cheque') then
    raise exception 'Un fiado se cobra en efectivo, con tarjeta o con transferencia.';
  end if;

  select coalesce(sum(saldo), 0) into v_debe
  from app.estado_de_fiados(v_persona.id)
  where p_fiado_id is null or fiado_id = p_fiado_id;
  if v_importe > v_debe + 0.009 then
    raise exception 'Debe % y se quieren cobrar %.', app.pesos(v_debe), app.pesos(v_importe);
  end if;

  if v_medio.afecta_caja then
    if p_caja_id is null then
      raise exception 'Cobrar en % necesita una caja abierta: si no, el dinero entra y el arqueo no lo ve.', v_medio.nombre;
    end if;
    select estado into v_estado from public.caja where id = p_caja_id;
    if v_estado is null then
      raise exception 'La caja indicada no existe.';
    end if;
    if v_estado <> 'abierta' then
      raise exception 'La caja está cerrada.';
    end if;
  end if;

  insert into public.fiado_pago (id, persona_id, importe, medio_pago_id, caja_id, usuario_id)
  values (v_pago, v_persona.id, v_importe, v_medio.id, p_caja_id, v_usuario);

  v_resta := v_importe;
  for v_f in
    select e.fiado_id, e.saldo
    from app.estado_de_fiados(v_persona.id) e
    join public.fiado f on f.id = e.fiado_id
    where e.saldo > 0 and (p_fiado_id is null or e.fiado_id = p_fiado_id)
    order by f.fecha, f.creado_en
  loop
    exit when v_resta <= 0;
    v_parte := least(v_resta, v_f.saldo);
    insert into public.fiado_imputacion (pago_id, fiado_id, importe) values (v_pago, v_f.fiado_id, v_parte);
    v_resta := v_resta - v_parte;
  end loop;

  v_numero := app.siguiente_numero_recibo(v_serie);
  v_concepto := 'Pago de fiado' || coalesce(' — ' || (
    select string_agg('venta ' || v.codigo, ', ' order by f.fecha)
    from public.fiado_imputacion i
    join public.fiado f on f.id = i.fiado_id
    join public.venta v on v.id = f.venta_id
    where i.pago_id = v_pago), '');

  insert into public.recibo (id, serie, numero, fiado_persona_id, fecha, total, concepto, emitido_por)
  values (p_id, v_serie, v_numero, v_persona.id, app.hoy_en_obera(), v_importe, v_concepto, v_usuario);

  insert into public.recibo_pago (recibo_id, orden, medio_pago_id, importe, fiado_pago_id)
  values (p_id, 1, v_medio.id, v_importe, v_pago);

  if v_medio.afecta_caja then
    insert into public.caja_movimiento (caja_id, tipo, importe, concepto, usuario_id)
    values (p_caja_id, 'ingreso', v_importe,
            'Cobro de fiado — ' || v_persona.nombre || ' · recibo ' || v_serie || '-' || lpad(v_numero::text, 8, '0'),
            v_usuario);
  end if;

  return json_build_object('id', p_id, 'serie', v_serie, 'numero', v_numero, 'total', v_importe, 'repetido', false);
end;
$$;

grant execute on function public.cobrar_fiado(uuid, uuid, uuid, numeric, uuid, uuid) to authenticated;

-- ── Las estadísticas ────────────────────────────────────────────
create or replace function public.fiados_estadisticas()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', app.hoy_en_obera())::date;
begin
  if not app.tiene_permiso('fiados.ver') then
    raise exception 'No tenés permiso para ver los fiados.';
  end if;

  return (
    select json_build_object(
      'personas_que_deben', (select count(distinct persona_id) from app.estado_de_fiados(null) where saldo > 0.009),
      'personas_con_vencido', (select count(distinct persona_id) from app.estado_de_fiados(null) where vencido > 0.009),
      'debe', (select coalesce(sum(saldo), 0) from app.estado_de_fiados(null)),
      'vencido', (select coalesce(sum(vencido), 0) from app.estado_de_fiados(null)),
      'fiados', (select count(*) from public.fiado where anulado_en is null),
      'fiado_total', (select coalesce(sum(importe), 0) from public.fiado where anulado_en is null),
      'promedio', (select coalesce(round(avg(importe), 2), 0) from public.fiado where anulado_en is null),
      'cobrado_total', (select coalesce(sum(importe), 0) from public.fiado_pago),
      'fiado_mes', (select coalesce(sum(importe), 0) from public.fiado where anulado_en is null and fecha >= v_mes),
      'cobrado_mes', (select coalesce(sum(importe), 0) from public.fiado_pago where fecha >= v_mes)
    )
  );
end;
$$;

grant execute on function public.fiados_estadisticas() to authenticated;

-- ── El recibo de un fiado se lista e imprime como cualquier otro ─
create or replace function public.listar_recibos(p_texto text default null, p_limite integer default 200)
returns table(id uuid, serie text, numero bigint, fecha date, total numeric, cliente_id uuid, cliente_nombre text,
              medios text, orden_numero bigint, emitido_por_nombre text, mail_estado text)
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
         coalesce(c.nombre, fp.nombre || ' (fiado)'),
         (select string_agg(distinct mp.nombre, ', ') from public.recibo_pago rp
          join public.medio_pago mp on mp.id = rp.medio_pago_id where rp.recibo_id = r.id),
         o.numero, u.nombre, r.mail_estado
  from public.recibo r
  left join public.cliente c on c.id = r.cliente_id
  left join public.fiado_persona fp on fp.id = r.fiado_persona_id
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario u on u.id = r.emitido_por
  where ((r.cliente_id is not null and v_cuentas) or (r.fiado_persona_id is not null and v_fiados))
    and (v_texto is null
     or coalesce(c.nombre, fp.nombre) ilike '%' || v_texto || '%'
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
  if v_recibo.fiado_persona_id is not null and not app.tiene_permiso('fiados.ver') then
    raise exception 'No tenés permiso para ver recibos.';
  end if;

  select json_build_object(
    'id', r.id, 'serie', r.serie, 'numero', r.numero, 'fecha', r.fecha, 'total', r.total,
    'concepto', r.concepto, 'emitido_en', r.emitido_en,
    'emitido_por_nombre', u.nombre,
    'mail_destinatario', r.mail_destinatario, 'mail_estado', r.mail_estado,
    'mail_error', r.mail_error, 'mail_en', r.mail_en,
    'cliente_id', c.id, 'cliente_nombre', coalesce(c.nombre, fp.nombre), 'cliente_email', c.email,
    'cliente_documento', coalesce(c.numero_documento, fp.documento),
    'cliente_domicilio', coalesce(nullif(concat_ws(' ', c.calle, c.numero) || coalesce(', ' || c.localidad, ''), ''),
                                  fp.domicilio),
    'fiado_persona_id', fp.id,
    'saldo_despues', case
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
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario uv on uv.id = o.vendedor_id
  where r.id = p_id;

  return v_resultado;
end;
$$;

revoke execute on function public.fiado_aviso(text), public.listar_fiados(text, boolean), public.fiado_ficha(uuid),
  public.fiado_guardar_ficha(uuid, text, text, text), public.fiado_fijar_cronograma(uuid, jsonb, text),
  public.cobrar_fiado(uuid, uuid, uuid, numeric, uuid, uuid), public.fiados_estadisticas()
  from public, anon;
