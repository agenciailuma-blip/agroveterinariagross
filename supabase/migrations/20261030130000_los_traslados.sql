/*
  ─────────────────────────────────────────────────────────────
  Las órdenes de traslado

  Fase 03, punto 6. No es el reparto de mercadería: es ir a buscar o
  llevar un animal, vivo o muerto —para una eutanasia, para una
  operación—. Un servicio del consultorio, con su propia pantalla.

  Cada orden lleva fecha, hora, motivo, dirección, el dueño con su
  teléfono, el animal y el monto. Pasa por tres estados —pendiente, en
  camino, finalizada— y se puede corregir mientras no esté finalizada.
  Al finalizar se anotan los kilómetros, el costo y cuánto tardó: con
  eso salen las estadísticas.

  ─── EL COBRO ───

  Por la caja, como cualquier venta. «Mandar a caja» arma una venta que
  espera en la cola —igual que un pedido de la tienda— con un renglón
  «Traslado» por el monto, sin producto: un servicio no tiene stock. La
  factura que sale de ahí queda asociada a la orden.
  ─────────────────────────────────────────────────────────────
*/

insert into public.permiso (clave, grupo, descripcion, orden) values
  ('traslados.ver',    'Traslados', 'Ver las órdenes de traslado y su resumen', 560),
  ('traslados.editar', 'Traslados', 'Cargar, corregir, finalizar y mandar a caja las órdenes de traslado', 561)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r
cross join (values ('traslados.ver'), ('traslados.editar')) as p(clave)
where r.nombre in ('Administrador', 'Encargado') and r.eliminado_en is null
on conflict do nothing;

create sequence if not exists public.traslado_numero_seq;

create table public.traslado (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null unique default nextval('public.traslado_numero_seq'),
  fecha            date not null,
  hora             time,
  motivo           text not null check (motivo in ('eutanasia', 'cirugia', 'retiro', 'devolucion', 'otro')),
  direccion        text not null check (length(btrim(direccion)) between 1 and 200),
  localidad        text,
  dueno_nombre     text not null check (length(btrim(dueno_nombre)) between 1 and 120),
  dueno_telefono   text,
  descripcion      text,
  monto            numeric(14, 2) not null default 0 check (monto >= 0),
  observaciones    text,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'en_camino', 'finalizada', 'cancelada')),
  -- Lo que se anota al finalizar.
  km               numeric(8, 1) check (km >= 0),
  costo            numeric(14, 2) check (costo >= 0),
  minutos          integer check (minutos >= 0),
  motivo_cancelacion text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid references public.usuario(id),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references public.usuario(id),
  estado_en        timestamptz not null default now(),
  estado_por       uuid references public.usuario(id)
);

alter sequence public.traslado_numero_seq owned by public.traslado.numero;

create index traslado_fecha_idx on public.traslado (fecha, hora);
create index traslado_abierto_idx on public.traslado (fecha) where estado in ('pendiente', 'en_camino');

comment on table public.traslado is
  'Orden de traslado de un animal: ir a buscarlo o llevarlo. Se cobra por la caja; las ventas quedan en traslado_venta.';

create table public.traslado_venta (
  traslado_id  uuid not null references public.traslado(id),
  venta_id     uuid not null unique references public.venta(id),
  creado_en    timestamptz not null default now(),
  primary key (traslado_id, venta_id)
);

alter table public.traslado enable row level security;
alter table public.traslado_venta enable row level security;

create policy traslado_select on public.traslado
  for select to authenticated using ((select app.tiene_permiso('traslados.ver')));
create policy traslado_venta_select on public.traslado_venta
  for select to authenticated using ((select app.tiene_permiso('traslados.ver')));

grant select on public.traslado, public.traslado_venta to authenticated;

-- ── Cargar o corregir ───────────────────────────────────────────
/*
  El identificador lo pone la pantalla: la misma función carga una
  orden nueva o corrige una que existe. Una finalizada o cancelada ya
  no se toca.
*/
create or replace function public.guardar_traslado(p_id uuid, p jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual   public.traslado;
  v_usuario  uuid := app.usuario_actual_id();
  v_fecha    date := app.fecha_o_nulo(p->>'fecha');
  v_hora     time;
  v_monto    numeric;
  v_resultado public.traslado;
begin
  if not app.tiene_permiso('traslados.editar') then
    raise exception 'No tenés permiso para cargar traslados.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la orden.';
  end if;
  if v_fecha is null then
    raise exception 'Falta la fecha.';
  end if;
  if nullif(btrim(coalesce(p->>'direccion', '')), '') is null then
    raise exception 'Falta la dirección.';
  end if;
  if nullif(btrim(coalesce(p->>'dueno_nombre', '')), '') is null then
    raise exception 'Falta el nombre del dueño.';
  end if;
  if coalesce(p->>'motivo', '') not in ('eutanasia', 'cirugia', 'retiro', 'devolucion', 'otro') then
    raise exception 'Falta el motivo.';
  end if;
  begin
    v_hora := nullif(btrim(coalesce(p->>'hora', '')), '')::time;
  exception when others then
    raise exception 'La hora no se entiende: %.', p->>'hora';
  end;
  v_monto := round(coalesce(nullif(p->>'monto', '')::numeric, 0), 2);
  if v_monto < 0 then
    raise exception 'El monto no puede ser negativo.';
  end if;

  select * into v_actual from public.traslado where id = p_id for update;
  if v_actual.id is not null and v_actual.estado in ('finalizada', 'cancelada') then
    raise exception 'La orden % está %: ya no se puede corregir.', v_actual.numero, v_actual.estado;
  end if;
  if v_actual.id is not null and v_actual.monto <> v_monto and exists (
       select 1 from public.traslado_venta tv join public.venta v on v.id = tv.venta_id
       where tv.traslado_id = p_id and v.estado <> 'anulada') then
    raise exception 'La orden % ya se mandó a la caja: para cambiar el monto, primero anulá esa venta.', v_actual.numero;
  end if;

  insert into public.traslado (id, fecha, hora, motivo, direccion, localidad, dueno_nombre, dueno_telefono,
                               descripcion, monto, observaciones, creado_por, actualizado_por, estado_por)
  values (p_id, v_fecha, v_hora, p->>'motivo', btrim(p->>'direccion'),
          nullif(btrim(coalesce(p->>'localidad', '')), ''),
          btrim(p->>'dueno_nombre'),
          nullif(btrim(coalesce(p->>'dueno_telefono', '')), ''),
          nullif(btrim(coalesce(p->>'descripcion', '')), ''),
          v_monto,
          nullif(btrim(coalesce(p->>'observaciones', '')), ''),
          v_usuario, v_usuario, v_usuario)
  on conflict (id) do update
  set fecha = excluded.fecha, hora = excluded.hora, motivo = excluded.motivo,
      direccion = excluded.direccion, localidad = excluded.localidad,
      dueno_nombre = excluded.dueno_nombre, dueno_telefono = excluded.dueno_telefono,
      descripcion = excluded.descripcion, monto = excluded.monto, observaciones = excluded.observaciones,
      actualizado_en = now(), actualizado_por = v_usuario
  returning * into v_resultado;

  return json_build_object('id', v_resultado.id, 'numero', v_resultado.numero);
end;
$$;

-- ── Cambiar de estado ───────────────────────────────────────────
create or replace function public.traslado_cambiar_estado(
  p_id uuid, p_estado text, p_km numeric default null, p_costo numeric default null,
  p_minutos integer default null, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual  public.traslado;
  v_usuario uuid := app.usuario_actual_id();
begin
  if not app.tiene_permiso('traslados.editar') then
    raise exception 'No tenés permiso para cambiar los traslados.';
  end if;
  select * into v_actual from public.traslado where id = p_id for update;
  if v_actual.id is null then
    raise exception 'La orden de traslado no existe.';
  end if;
  if v_actual.estado in ('finalizada', 'cancelada') then
    raise exception 'La orden % ya está %.', v_actual.numero, v_actual.estado;
  end if;
  if p_estado not in ('pendiente', 'en_camino', 'finalizada', 'cancelada') then
    raise exception 'Estado desconocido: %.', p_estado;
  end if;
  if p_estado = 'cancelada' then
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      raise exception 'Para cancelar la orden hace falta el motivo.';
    end if;
    if exists (select 1 from public.traslado_venta tv join public.venta v on v.id = tv.venta_id
               where tv.traslado_id = p_id and v.estado <> 'anulada') then
      raise exception 'La orden % ya se mandó a la caja: anulá esa venta antes de cancelarla.', v_actual.numero;
    end if;
  end if;
  if p_estado = 'finalizada' and (p_km < 0 or p_costo < 0 or p_minutos < 0) then
    raise exception 'Los kilómetros, el costo y el tiempo no pueden ser negativos.';
  end if;

  update public.traslado
  set estado = p_estado,
      estado_en = now(), estado_por = v_usuario,
      km      = case when p_estado = 'finalizada' then round(p_km, 1) else km end,
      costo   = case when p_estado = 'finalizada' then round(p_costo, 2) else costo end,
      minutos = case when p_estado = 'finalizada' then p_minutos else minutos end,
      motivo_cancelacion = case when p_estado = 'cancelada' then btrim(p_motivo) else motivo_cancelacion end
  where id = p_id;
end;
$$;

-- ── Mandar a caja ───────────────────────────────────────────────
/*
  Una venta que espera en la cola de la caja, como un pedido de la
  tienda: Consumidor Final —el dueño se elige en la caja si quiere
  factura a su nombre—, con un renglón por el monto, sin producto.
  Una sola por orden, salvo que la anterior se haya anulado.
*/
create or replace function public.traslado_a_caja(p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t        public.traslado;
  v_cf       uuid;
  v_venta    uuid;
  v_codigo   text;
  v_previas  integer;
  v_detalle  text;
begin
  if not app.tiene_permiso('traslados.editar') then
    raise exception 'No tenés permiso para mandar traslados a la caja.';
  end if;
  select * into v_t from public.traslado where id = p_id for update;
  if v_t.id is null then
    raise exception 'La orden de traslado no existe.';
  end if;
  if v_t.estado = 'cancelada' then
    raise exception 'La orden % está cancelada.', v_t.numero;
  end if;
  if v_t.monto <= 0 then
    raise exception 'La orden % no tiene monto: cargalo antes de mandarla a la caja.', v_t.numero;
  end if;
  if exists (select 1 from public.traslado_venta tv join public.venta v on v.id = tv.venta_id
             where tv.traslado_id = p_id and v.estado <> 'anulada') then
    raise exception 'La orden % ya está en la caja o cobrada.', v_t.numero;
  end if;

  select id into v_cf from public.cliente where codigo = 'CF' and eliminado_en is null;
  if v_cf is null then
    raise exception 'No se encontró el cliente Consumidor Final.';
  end if;

  select count(*) into v_previas from public.traslado_venta where traslado_id = p_id;
  v_codigo := 'TRA-' || lpad(v_t.numero::text, 6, '0') || case when v_previas > 0 then '-' || (v_previas + 1) else '' end;

  v_detalle := 'Traslado · ' || case v_t.motivo
      when 'eutanasia' then 'eutanasia' when 'cirugia' then 'cirugía' when 'retiro' then 'retiro'
      when 'devolucion' then 'devolución' else 'otro' end
    || coalesce(' · ' || nullif(btrim(v_t.descripcion), ''), '');

  insert into public.venta (codigo, estado, cliente_id, documentacion, observaciones, ocurrido_en, enviada_caja_en,
                            nombre_para_llamar)
  values (v_codigo, 'en_caja', v_cf, 'fiscal',
          'Orden de traslado ' || v_t.numero || ' · ' || v_t.dueno_nombre,
          now(), now(), left(v_t.dueno_nombre, 60))
  returning id into v_venta;

  insert into public.venta_linea (venta_id, orden, producto_id, codigo_producto, descripcion, cantidad,
                                  precio_original, precio_unitario, precio_acordado, alicuota_iva_id, condicion_iva)
  values (v_venta, 1, null, 'TRASLADO', left(v_detalle, 200), 1, v_t.monto, v_t.monto, v_t.monto, 5, 'gravado');

  insert into public.traslado_venta (traslado_id, venta_id) values (p_id, v_venta);

  return json_build_object('venta_id', v_venta, 'codigo', v_codigo);
end;
$$;

-- ── La lista, con sus ventas y comprobantes ─────────────────────
create or replace function public.listar_traslados(p_vista text default 'abiertas', p_texto text default null)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if not app.tiene_permiso('traslados.ver') then
    raise exception 'No tenés permiso para ver los traslados.';
  end if;

  return coalesce((
    select json_agg(x.fila order by x.orden)
    from (
      select row_number() over (order by
               case when p_vista = 'abiertas' then t.fecha end,
               case when p_vista = 'abiertas' then t.hora end nulls last,
               case when p_vista <> 'abiertas' then t.fecha end desc,
               t.numero desc) as orden,
             json_build_object(
        'id', t.id, 'numero', t.numero, 'fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'),
        'motivo', t.motivo, 'direccion', t.direccion, 'localidad', t.localidad,
        'dueno_nombre', t.dueno_nombre, 'dueno_telefono', t.dueno_telefono,
        'descripcion', t.descripcion, 'monto', t.monto, 'observaciones', t.observaciones,
        'estado', t.estado, 'km', t.km, 'costo', t.costo, 'minutos', t.minutos,
        'motivo_cancelacion', t.motivo_cancelacion,
        'creado_por', uc.nombre, 'estado_en', t.estado_en, 'estado_por', ue.nombre,
        'ventas', coalesce((
          select json_agg(json_build_object(
            'venta_id', v.id, 'codigo', v.codigo, 'estado', v.estado, 'total', v.total,
            'comprobante_id', c.id,
            'comprobante', case when c.id is not null then
              tc.descripcion || ' ' || lpad(pv.numero::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0') end,
            'no_fiscal_id', nf.id)
            order by tv.creado_en)
          from public.traslado_venta tv
          join public.venta v on v.id = tv.venta_id
          left join lateral (
            select c.* from public.comprobante c
            where c.venta_id = v.id
               or exists (select 1 from public.comprobante_venta cv where cv.comprobante_id = c.id and cv.venta_id = v.id)
            order by c.creado_en desc limit 1) c on true
          left join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
          left join public.punto_venta pv on pv.id = c.punto_venta_id
          left join lateral (
            select n.id from public.comprobante_no_fiscal n
            where n.venta_id = v.id and n.tipo_clave = 'comprobante_interno'
            order by n.creado_en desc limit 1) nf on true
          where tv.traslado_id = t.id), '[]'::json)
      ) as fila
      from public.traslado t
      left join public.usuario uc on uc.id = t.creado_por
      left join public.usuario ue on ue.id = t.estado_por
      where case p_vista
              when 'abiertas' then t.estado in ('pendiente', 'en_camino')
              when 'cerradas' then t.estado in ('finalizada', 'cancelada')
              else true end
        and (v_texto is null
             or t.dueno_nombre ilike '%' || v_texto || '%'
             or t.direccion ilike '%' || v_texto || '%'
             or coalesce(t.descripcion, '') ilike '%' || v_texto || '%'
             or t.numero::text = v_texto)
      order by orden
      limit 300
    ) x
  ), '[]'::json);
end;
$$;

-- ── Las estadísticas ────────────────────────────────────────────
create or replace function public.traslados_estadisticas(p_desde date, p_hasta date)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('traslados.ver') then
    raise exception 'No tenés permiso para ver los traslados.';
  end if;

  return (
    select json_build_object(
      'finalizadas', count(*),
      'km', coalesce(sum(km), 0),
      'costo', coalesce(sum(costo), 0),
      'minutos', coalesce(sum(minutos), 0),
      'monto', coalesce(sum(monto), 0),
      'con_datos', count(*) filter (where km is not null or costo is not null or minutos is not null),
      'por_motivo', coalesce((
        select json_object_agg(m.motivo, m.cantidad)
        from (select motivo, count(*) as cantidad from public.traslado
              where estado = 'finalizada' and fecha between p_desde and p_hasta group by motivo) m), '{}'::json)
    )
    from public.traslado
    where estado = 'finalizada' and fecha between p_desde and p_hasta
  );
end;
$$;

revoke all on function public.guardar_traslado(uuid, jsonb),
  public.traslado_cambiar_estado(uuid, text, numeric, numeric, integer, text),
  public.traslado_a_caja(uuid), public.listar_traslados(text, text),
  public.traslados_estadisticas(date, date)
  from public, anon;
grant execute on function public.guardar_traslado(uuid, jsonb),
  public.traslado_cambiar_estado(uuid, text, numeric, numeric, integer, text),
  public.traslado_a_caja(uuid), public.listar_traslados(text, text),
  public.traslados_estadisticas(date, date)
  to authenticated;
