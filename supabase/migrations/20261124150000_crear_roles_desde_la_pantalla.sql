/*
  ─────────────────────────────────────────────────────────────
  Crear roles desde la pantalla (24/11)

  Hasta hoy los roles eran los de fábrica: se podían tocar sus permisos,
  pero no armar uno nuevo («Repositor», «Contadora»). La tabla y su
  política ya lo permitían a quien tiene «Administrar roles y permisos»;
  lo que faltaba era la pantalla y estos candados, que valen también si
  alguien escribe directo a la API:

  - Un rol de fábrica no se renombra ni se borra. La app usa sus nombres
    sin conexión (la caja reconoce al Administrador y al Encargado para
    autorizar un vencido) y un cambio de nombre lo rompería en silencio.
  - Un rol con gente asignada no se borra: primero se los pasa a otro.
    Si no, quedarían personas con un rol que no aparece en ningún lado.
  - Nadie se marca un rol propio como «de fábrica» ni se lo quita a uno
    de fábrica.

  Se aprovecha para ordenar el catálogo: los permisos de proveedores y
  el de aumentar precios habían entrado con el grupo en minúscula y la
  pantalla los mostraba en cajas sueltas («proveedores», «productos»).
  ─────────────────────────────────────────────────────────────
*/

update public.permiso set grupo = 'Productos' where clave = 'productos.aumentar_precios';

update public.permiso set grupo = 'Proveedores', orden = v.orden
  from (values ('proveedores.ver', 740), ('proveedores.gestionar', 745), ('proveedores.pagar', 750)) as v(clave, orden)
 where permiso.clave = v.clave;

create or replace function app.cuidar_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gente integer;
begin
  if TG_OP = 'INSERT' then
    if new.es_sistema then
      raise exception 'Un rol nuevo no puede ser de fábrica.';
    end if;
    return new;
  end if;

  -- Borrado de verdad o baja: los dos dejan al rol fuera de la lista.
  if TG_OP = 'DELETE' or (old.eliminado_en is null and new.eliminado_en is not null) then
    if old.es_sistema then
      raise exception 'El rol % es de fábrica y no se puede borrar.', old.nombre;
    end if;
    select count(*) into v_gente
      from public.usuario u
     where u.rol_id = old.id and u.eliminado_en is null;
    if v_gente > 0 then
      raise exception 'El rol % tiene % persona(s) asignada(s). Pasalas a otro rol antes de borrarlo.', old.nombre, v_gente;
    end if;
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if new.es_sistema is distinct from old.es_sistema then
    raise exception 'No se puede cambiar si un rol es de fábrica.';
  end if;
  if old.es_sistema and new.nombre is distinct from old.nombre then
    raise exception 'El rol % es de fábrica y no se puede renombrar.', old.nombre;
  end if;
  return new;
end;
$$;

comment on function app.cuidar_rol() is
  'Los roles de fábrica no se renombran ni se borran, y ninguno se borra con gente asignada.';

drop trigger if exists rol_cuidar on public.rol;
create trigger rol_cuidar
  before insert or update or delete on public.rol
  for each row execute function app.cuidar_rol();

-- Una persona no puede quedar apuntando a un rol dado de baja.
create or replace function app.usuario_con_rol_vigente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.eliminado_en is null and exists (
    select 1 from public.rol r where r.id = new.rol_id and r.eliminado_en is not null
  ) then
    raise exception 'Ese rol fue borrado. Elegí otro.';
  end if;
  return new;
end;
$$;

drop trigger if exists usuario_rol_vigente on public.usuario;
create trigger usuario_rol_vigente
  before insert or update of rol_id, eliminado_en on public.usuario
  for each row execute function app.usuario_con_rol_vigente();
