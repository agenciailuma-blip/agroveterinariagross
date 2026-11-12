/*
  ─────────────────────────────────────────────────────────────
  Dos computadoras en el mismo puesto

  El 12/11 la impresora de la caja 2 aparecía en la caja 1 y al revés.
  Las dos PC estaban elegidas como «Caja 1» —la Caja 2 figuraba «nunca»
  conectada—, y el puesto guardaba una sola impresora. La impresora pasó
  a guardarse en cada PC, pero dos PC en un puesto siguen compartiendo la
  numeración de los comprobantes internos y quién escucha a las demás sin
  internet.

  Cada PC tiene un identificador al azar y lo anuncia al abrir. Si el
  puesto lo había anunciado otra PC en las últimas 12 horas, la pantalla
  avisa que hay que elegir otro puesto.
  ─────────────────────────────────────────────────────────────
*/

alter table public.terminal add column if not exists equipo_id text;
alter table public.terminal add column if not exists equipo_visto_en timestamptz;

comment on column public.terminal.equipo_id is
  'La última computadora que abrió el sistema como este puesto (un identificador al azar de esa PC).';

create or replace function public.anunciar_equipo(p_terminal_id uuid, p_equipo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior text;
  v_visto    timestamptz;
begin
  if app.usuario_actual_id() is null then
    return false;
  end if;

  select equipo_id, equipo_visto_en into v_anterior, v_visto
  from public.terminal where id = p_terminal_id
  for update;

  update public.terminal
     set equipo_id = p_equipo, equipo_visto_en = now()
   where id = p_terminal_id;

  -- true: otra PC usó este puesto hace poco.
  return v_anterior is not null
     and v_anterior <> p_equipo
     and v_visto > now() - interval '12 hours';
end;
$$;

comment on function public.anunciar_equipo(uuid, text) is
  'Anota qué computadora abrió el sistema como este puesto. Devuelve true si otra lo usó en las últimas 12 horas.';

revoke all on function public.anunciar_equipo(uuid, text) from public, anon;
grant execute on function public.anunciar_equipo(uuid, text) to authenticated;
