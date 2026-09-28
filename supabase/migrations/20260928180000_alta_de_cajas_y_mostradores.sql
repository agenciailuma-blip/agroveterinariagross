-- ═══════════════════════════════════════════════════════════════
-- GROSS DA DE ALTA SUS CAJAS Y MOSTRADORES
--
-- Pedido por Francisco el 28/09. Hasta hoy una terminal nueva la daba de
-- alta alguien de nuestro lado, directo en la base: la tabla ni siquiera
-- tenía una política de alta. Con el segundo local en camino, Gross
-- tiene que poder hacerlo solo, desde Configuración.
--
-- ─── LO QUE SE PUEDE Y LO QUE NO ───
--
-- · Se crea con nombre, tipo, prefijo y —si es caja— punto de venta.
-- · Después se cambian el nombre y el punto de venta.
-- · El tipo y el prefijo NO se cambian. El prefijo encabeza el número de
--   cada venta de esa máquina (MOS2-000123) y el comprobante interno; si
--   cambiara, las ventas viejas y las nuevas de la misma máquina
--   quedarían con dos nombres. Si se cargó mal, se da de baja y se crea
--   otra — sin ventas todavía, no pasa nada.
-- · Se da de baja, pero no si es la caja que escucha a las demás cuando
--   se corta internet, ni si tiene la caja abierta: las dos cosas dejan
--   al local sin poder cobrar.
--
-- Todo con 'configuracion.gestionar', que es el mismo permiso que ya
-- pedía la tabla para modificar terminales.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.crear_terminal(
  p_nombre         text,
  p_tipo           text,
  p_prefijo        text,
  p_punto_venta_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_id      uuid;
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para dar de alta cajas ni mostradores.';
  end if;

  if v_nombre = '' then
    raise exception 'La terminal necesita un nombre, por ejemplo «Mostrador 3».';
  end if;

  if p_tipo not in ('caja', 'mostrador', 'oficina') then
    raise exception 'El tipo tiene que ser caja, mostrador u oficina.';
  end if;

  -- Corto y sin espacios: va adelante de cada número de venta.
  if v_prefijo !~ '^[A-Z][A-Z0-9]{1,7}$' then
    raise exception 'El prefijo va sin espacios ni signos, de 2 a 8 letras o números, empezando con una letra. Por ejemplo MOS3 o CAJA2.';
  end if;

  if p_tipo = 'caja' then
    if p_punto_venta_id is null then
      raise exception 'Una caja factura, y para eso necesita un punto de venta.';
    end if;
    if not exists (select 1 from public.punto_venta
                   where id = p_punto_venta_id and activo and not es_respaldo and eliminado_en is null) then
      raise exception 'Ese punto de venta no sirve para una caja: no existe, está inactivo o es el de contingencia.';
    end if;
  end if;

  begin
    insert into public.terminal (nombre, tipo, prefijo, punto_venta_id)
    values (v_nombre, p_tipo, v_prefijo,
            case when p_tipo = 'caja' then p_punto_venta_id end)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from public.terminal
               where upper(prefijo) = v_prefijo and eliminado_en is null) then
      raise exception 'El prefijo % ya lo usa otra terminal.', v_prefijo;
    end if;
    raise exception 'Ya hay una terminal que se llama «%».', v_nombre;
  end;

  return v_id;
end;
$$;

comment on function public.crear_terminal(text, text, text, uuid) is
  'Da de alta una caja, un mostrador o una oficina. El prefijo encabeza sus números de venta y no se cambia después.';

revoke all on function public.crear_terminal(text, text, text, uuid) from public, anon;
grant execute on function public.crear_terminal(text, text, text, uuid) to authenticated;

create or replace function public.editar_terminal(
  p_id             uuid,
  p_nombre         text,
  p_punto_venta_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminal;
  v_nombre   text := btrim(coalesce(p_nombre, ''));
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para modificar cajas ni mostradores.';
  end if;

  select * into v_terminal from public.terminal where id = p_id and eliminado_en is null;
  if v_terminal.id is null then
    raise exception 'Esa terminal no existe o está dada de baja.';
  end if;

  if v_nombre = '' then
    raise exception 'La terminal necesita un nombre.';
  end if;

  if v_terminal.tipo = 'caja' and not exists (
    select 1 from public.punto_venta
    where id = p_punto_venta_id and activo and not es_respaldo and eliminado_en is null
  ) then
    raise exception 'Una caja necesita un punto de venta activo, que no sea el de contingencia.';
  end if;

  begin
    update public.terminal
       set nombre = v_nombre,
           punto_venta_id = case when v_terminal.tipo = 'caja' then p_punto_venta_id end
     where id = p_id;
  exception when unique_violation then
    raise exception 'Ya hay una terminal que se llama «%».', v_nombre;
  end;
end;
$$;

revoke all on function public.editar_terminal(uuid, text, uuid) from public, anon;
grant execute on function public.editar_terminal(uuid, text, uuid) to authenticated;

create or replace function public.dar_de_baja_terminal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.terminal;
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para dar de baja cajas ni mostradores.';
  end if;

  select * into v_terminal from public.terminal where id = p_id and eliminado_en is null for update;
  if v_terminal.id is null then
    raise exception 'Esa terminal no existe o ya estaba dada de baja.';
  end if;

  if v_terminal.es_punto_de_encuentro then
    raise exception '«%» es la caja que escucha a las demás cuando se corta internet. Primero elegí otra en «La red del local».', v_terminal.nombre;
  end if;

  if exists (select 1 from public.caja where terminal_id = p_id and estado = 'abierta') then
    raise exception '«%» tiene la caja abierta. Cerrala antes de darla de baja.', v_terminal.nombre;
  end if;

  update public.terminal
     set activo = false, eliminado_en = now()
   where id = p_id;
end;
$$;

comment on function public.dar_de_baja_terminal(uuid) is
  'Baja lógica de una terminal. No se puede con la caja que escucha a las demás ni con una caja abierta.';

revoke all on function public.dar_de_baja_terminal(uuid) from public, anon;
grant execute on function public.dar_de_baja_terminal(uuid) to authenticated;
