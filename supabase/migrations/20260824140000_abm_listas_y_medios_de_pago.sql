-- ═══════════════════════════════════════════════════════════════
-- 032 — ABM DE LISTAS DE PRECIO Y MEDIOS DE PAGO
--
-- El alcance dice que "el sistema permite crear listas y reglas
-- adicionales sin depender del desarrollo", y hasta ahora sólo se podía
-- editar el porcentaje de lo que ya existía. En Argentina las formas de
-- pago cambian varias veces por año: si cada cambio necesita una
-- actualización del sistema, el sistema estorba.
--
-- Las funciones estan aca y no en la pantalla porque son reglas que no
-- se pueden saltear desde el navegador. Sacar la lista que usa un medio
-- de pago, o quedarse sin medio de pago activo, deja la caja sin poder
-- cobrar: eso no puede depender de que la pantalla se acuerde de
-- chequearlo.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.guardar_lista_precio(
  p_id               uuid,
  p_nombre           text,
  p_ajuste           numeric,
  p_es_predeterminada boolean default false,
  p_orden            integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select app.tiene_permiso('configuracion.gestionar')) then
    raise exception 'No tenes permiso para administrar listas de precio.';
  end if;

  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'La lista necesita un nombre.';
  end if;

  if p_id is null then
    insert into public.lista_precio (nombre, ajuste_porcentaje, es_predeterminada, orden)
    values (trim(p_nombre), coalesce(p_ajuste, 0), false, coalesce(p_orden, 0))
    returning id into v_id;
  else
    update public.lista_precio
       set nombre            = trim(p_nombre),
           ajuste_porcentaje = coalesce(p_ajuste, 0),
           orden             = coalesce(p_orden, 0)
     where id = p_id and eliminado_en is null
    returning id into v_id;

    if v_id is null then
      raise exception 'La lista no existe o esta dada de baja.';
    end if;
  end if;

  -- Predeterminada hay una sola. Se marca despues de guardar para que
  -- el desmarcado de las otras no dependa del orden de las operaciones.
  if p_es_predeterminada then
    update public.lista_precio set es_predeterminada = (id = v_id)
     where eliminado_en is null;
  end if;

  return v_id;
end;
$$;

comment on function public.guardar_lista_precio(uuid, text, numeric, boolean, integer) is
  'Crea o edita una lista de precios. Garantiza que haya una sola lista predeterminada.';

grant execute on function public.guardar_lista_precio(uuid, text, numeric, boolean, integer) to authenticated;

create or replace function public.dar_de_baja_lista_precio(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usos text;
begin
  if not (select app.tiene_permiso('configuracion.gestionar')) then
    raise exception 'No tenes permiso para administrar listas de precio.';
  end if;

  if exists (select 1 from public.lista_precio
             where id = p_id and es_predeterminada and eliminado_en is null) then
    raise exception 'No se puede dar de baja la lista predeterminada. Marca otra como predeterminada primero.';
  end if;

  -- Un medio de pago sin lista no sabe que precio cobrar.
  select string_agg(m.nombre, ', ') into v_usos
  from public.medio_pago m
  where m.lista_precio_id = p_id and m.eliminado_en is null;

  if v_usos is not null then
    raise exception 'La usan estos medios de pago: %. Cambiales la lista antes de darla de baja.', v_usos;
  end if;

  update public.lista_precio
     set eliminado_en = now(), activo = false
   where id = p_id and eliminado_en is null;
end;
$$;

comment on function public.dar_de_baja_lista_precio(uuid) is
  'Da de baja una lista de precios. No deja hacerlo si es la predeterminada o si algun medio de pago la usa.';

grant execute on function public.dar_de_baja_lista_precio(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Medios de pago
--
-- Guarda el medio y de paso ajusta sus filas de cuotas: si se baja de
-- 12 a 3, las cuotas 4 a 12 se van. Si quedaran, el dia que alguien
-- vuelva a subir el maximo reaparecerian recargos viejos que nadie
-- reviso.
-- ───────────────────────────────────────────────────────────────
create or replace function public.guardar_medio_pago(
  p_id              uuid,
  p_nombre          text,
  p_tipo            text,
  p_lista_precio_id uuid,
  p_admite_cuotas   boolean default false,
  p_cuotas_maximas  integer default 1,
  p_afecta_caja     boolean default true,
  p_orden           integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid;
  v_maximo integer;
begin
  if not (select app.tiene_permiso('configuracion.gestionar')) then
    raise exception 'No tenes permiso para administrar medios de pago.';
  end if;

  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'El medio de pago necesita un nombre.';
  end if;

  v_maximo := case when p_admite_cuotas then greatest(coalesce(p_cuotas_maximas, 1), 1) else 1 end;

  if v_maximo > 24 then
    raise exception 'El maximo de cuotas es 24.';
  end if;

  if p_id is null then
    insert into public.medio_pago
      (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
    values
      (trim(p_nombre), p_tipo, p_lista_precio_id, coalesce(p_admite_cuotas, false),
       v_maximo, coalesce(p_afecta_caja, true), coalesce(p_orden, 0))
    returning id into v_id;
  else
    update public.medio_pago
       set nombre          = trim(p_nombre),
           tipo            = p_tipo,
           lista_precio_id = p_lista_precio_id,
           admite_cuotas   = coalesce(p_admite_cuotas, false),
           cuotas_maximas  = v_maximo,
           afecta_caja     = coalesce(p_afecta_caja, true),
           orden           = coalesce(p_orden, 0)
     where id = p_id and eliminado_en is null
    returning id into v_id;

    if v_id is null then
      raise exception 'El medio de pago no existe o esta dado de baja.';
    end if;
  end if;

  -- Las cuotas que sobran se van; las que faltan arrancan en 0% de
  -- recargo, que es lo unico honesto para una fila que nadie completo.
  delete from public.medio_pago_cuota
   where medio_pago_id = v_id and cuotas > v_maximo;

  insert into public.medio_pago_cuota (medio_pago_id, cuotas, recargo_porcentaje)
  select v_id, n, 0
  from generate_series(1, v_maximo) n
  on conflict (medio_pago_id, cuotas) do nothing;

  return v_id;
end;
$$;

comment on function public.guardar_medio_pago(uuid, text, text, uuid, boolean, integer, boolean, integer) is
  'Crea o edita un medio de pago y sincroniza sus filas de cuotas con el maximo indicado.';

grant execute on function public.guardar_medio_pago(uuid, text, text, uuid, boolean, integer, boolean, integer) to authenticated;

create or replace function public.dar_de_baja_medio_pago(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select app.tiene_permiso('configuracion.gestionar')) then
    raise exception 'No tenes permiso para administrar medios de pago.';
  end if;

  -- Sin ningun medio activo la caja no puede cobrar nada.
  if (select count(*) from public.medio_pago
      where eliminado_en is null and activo and id <> p_id) = 0 then
    raise exception 'Es el unico medio de pago activo. La caja no podria cobrar.';
  end if;

  update public.medio_pago
     set eliminado_en = now(), activo = false
   where id = p_id and eliminado_en is null;
end;
$$;

comment on function public.dar_de_baja_medio_pago(uuid) is
  'Da de baja un medio de pago. No deja quedarse sin ninguno activo. Los pagos ya registrados con el conservan su referencia.';

grant execute on function public.dar_de_baja_medio_pago(uuid) to authenticated;
