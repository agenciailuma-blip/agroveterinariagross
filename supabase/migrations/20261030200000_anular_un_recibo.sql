-- ═══════════════════════════════════════════════════════════════
-- ANULAR UN RECIBO
--
-- Fase 03, punto 5. Un recibo emitido por error se compensaba a mano en
-- la cuenta corriente, y el papel seguía figurando como bueno. Ahora se
-- anula: conserva su número, dice que está anulado y por qué, y se
-- deshace lo que había movido.
--
-- · La cuenta corriente: los movimientos no se tocan, así que entra una
--   nota de débito por el total. Vence en el día, igual que el cheque
--   que se le carga al cliente: es plata que ya tendría que haber pagado.
-- · El fiado: el pago queda marcado y se le sacan las imputaciones, así
--   la venta vuelve a deber. Qué ventas pagaba queda en el concepto.
-- · La caja: lo que había entrado al cajón sale de la caja abierta. Si
--   la del cobro ya cerró, su arqueo ya está hecho y no se toca.
-- · Los cheques: sólo si siguen en la cartera, y pasan a devueltos. Si ya
--   se depositaron o se endosaron, primero hay que resolver eso.
-- · La orden del vendedor: queda rechazada con el motivo. Si la plata
--   entra después, se arma otra orden: un recibo por orden.
-- ═══════════════════════════════════════════════════════════════

insert into public.permiso (clave, grupo, descripcion, orden) values
  ('cuentacorriente.anular_recibo', 'Cuenta cte.', 'Anular recibos', 525)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'cuentacorriente.anular_recibo'
from public.rol r
where r.nombre in ('Administrador', 'Encargado') and r.eliminado_en is null
on conflict do nothing;

alter table public.recibo
  add column anulado_en       timestamptz,
  add column anulado_por      uuid references public.usuario(id),
  add column motivo_anulacion text,
  add constraint recibo_anulado_con_motivo check (anulado_en is null or motivo_anulacion is not null);

alter table public.fiado_pago add column anulado_en timestamptz;

-- ── Anular ──────────────────────────────────────────────────────
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

  if v_recibo.cliente_id is not null then
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

revoke all on function public.anular_recibo(uuid, text, uuid) from public, anon;
grant execute on function public.anular_recibo(uuid, text, uuid) to authenticated, service_role;

-- ── El registro dice cuáles están anulados ──────────────────────
drop function public.listar_recibos(text, integer);

create function public.listar_recibos(p_texto text default null, p_limite integer default 200)
returns table(id uuid, serie text, numero bigint, fecha date, total numeric, cliente_id uuid, cliente_nombre text,
              medios text, orden_numero bigint, emitido_por_nombre text, mail_estado text, anulado_en timestamptz)
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
         o.numero, u.nombre, r.mail_estado, r.anulado_en
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

revoke all on function public.listar_recibos(text, integer) from public, anon;
grant execute on function public.listar_recibos(text, integer) to authenticated, service_role;

-- ── La hoja dice que está anulado ───────────────────────────────
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
    'anulado_en', r.anulado_en, 'anulado_por_nombre', ua.nombre, 'motivo_anulacion', r.motivo_anulacion,
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

-- ── La ficha del fiado ──────────────────────────────────────────
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
                                        'cobro', up.nombre, 'creado_en', p.creado_en, 'anulado_en', p.anulado_en,
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

-- ── Lo cobrado no cuenta lo anulado ─────────────────────────────
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
      'cobrado_total', (select coalesce(sum(importe), 0) from public.fiado_pago where anulado_en is null),
      'fiado_mes', (select coalesce(sum(importe), 0) from public.fiado where anulado_en is null and fecha >= v_mes),
      'cobrado_mes', (select coalesce(sum(importe), 0) from public.fiado_pago where anulado_en is null and fecha >= v_mes)
    )
  );
end;
$$;
