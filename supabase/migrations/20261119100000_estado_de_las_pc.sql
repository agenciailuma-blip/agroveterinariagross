/*
  ─────────────────────────────────────────────────────────────
  El estado de cada PC, informado por ella misma

  Hasta el 19/11, para saber si una PC del local había actualizado, si
  tenía la impresora o si le quedaban ventas sin enviar, había que
  preguntar en el local o entrar por AnyDesk. La columna version_app
  existía desde agosto, pero nada la llenaba.

  Ahora cada PC informa sola, al abrir y cada cinco minutos con
  internet: su versión, si es el programa o el navegador, la impresora
  elegida y si Windows la encuentra, lo que tiene sin enviar, el último
  error de sincronización y, la que escucha a las demás, si está
  escuchando. Se guarda en el puesto: una fila por puesto, lo último que
  dijo.

  El detalle va en un jsonb para poder sumar un dato sin otra migración;
  la versión va además en su columna, que ya leen las pantallas.
  ─────────────────────────────────────────────────────────────
*/

alter table public.terminal add column if not exists estado_pc jsonb;
alter table public.terminal add column if not exists estado_informado_en timestamptz;

comment on column public.terminal.estado_pc is
  'Lo último que informó la PC de este puesto: programa, impresora, sin enviar, último error, si escucha. Lo escribe informar_estado_pc.';
comment on column public.terminal.estado_informado_en is
  'Cuándo informó la PC su estado por última vez.';

create or replace function public.informar_estado_pc(
  p_terminal_id uuid,
  p_version     text,
  p_estado      jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.usuario_actual_id() is null then
    raise exception 'Hace falta una sesión para informar el estado de la PC';
  end if;

  if p_estado is null or jsonb_typeof(p_estado) <> 'object' then
    raise exception 'El estado de la PC tiene que ser un objeto';
  end if;

  -- Un estado desmedido no es un estado: es un error o un abuso.
  if length(p_estado::text) > 4000 then
    raise exception 'El estado de la PC es demasiado largo';
  end if;

  update public.terminal
     set version_app         = left(nullif(trim(p_version), ''), 30),
         estado_pc           = p_estado,
         estado_informado_en = now()
   where id = p_terminal_id
     and eliminado_en is null;
end;
$$;

comment on function public.informar_estado_pc(uuid, text, jsonb) is
  'Cada PC anota su versión y su estado en su puesto. La llama la app al abrir y cada cinco minutos.';

revoke all on function public.informar_estado_pc(uuid, text, jsonb) from public, anon;
grant execute on function public.informar_estado_pc(uuid, text, jsonb) to authenticated;
