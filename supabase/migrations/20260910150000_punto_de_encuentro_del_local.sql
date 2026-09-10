-- ═══════════════════════════════════════════════════════════════
-- EL PUNTO DE ENCUENTRO DEL LOCAL
--
-- Segunda mitad del punto 2-bis: sin internet, la venta que arma un
-- mostrador tiene que llegar igual a la caja. El camino ya existe; esto
-- es lo que hace falta para que las terminales sepan usarlo.
--
-- QUIÉN ESCUCHA se marca en la terminal, y hay una sola. Si hubiera dos,
-- cada mostrador le hablaría a una distinta y la mitad de las ventas
-- quedaría del otro lado.
--
-- LA CLAVE la comparte todo el local y viaja sola con el resto de la
-- configuración cuando la terminal sincroniza: no hay nada que cargar a
-- mano en cada máquina. No es criptografía — es lo que evita que
-- cualquiera parado en el wifi del local le mande ventas a la caja.
--
-- LA DIRECCIÓN la escribe sola la terminal que escucha, con el nombre
-- que tiene esa computadora en Windows. En el local ya se resuelven los
-- nombres entre máquinas: la impresora compartida se llama justamente
-- «POS80 Printer(2) en DESKTOP-O4R9STD». Así nadie tiene que averiguar
-- ni escribir una IP, que además cambia cuando la reparte el router.
-- ═══════════════════════════════════════════════════════════════

alter table public.terminal
  add column if not exists es_punto_de_encuentro boolean not null default false;

comment on column public.terminal.es_punto_de_encuentro is
  'La terminal que escucha a las demás cuando no hay internet. Hay exactamente una, y conviene que sea la de la caja: es donde la venta se cobra.';

create unique index if not exists terminal_punto_de_encuentro_unico
  on public.terminal (es_punto_de_encuentro)
  where es_punto_de_encuentro and eliminado_en is null;

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('local.clave', to_jsonb(gen_random_uuid()::text),
   'Clave compartida de la red del local. La usan las terminales para hablarse entre ellas sin internet. Se genera sola y no hay que tocarla.', 'local'),
  ('local.punto_de_encuentro', '""',
   'Nombre en Windows de la computadora que escucha. Lo escribe sola la terminal marcada como punto de encuentro.', 'local')
on conflict (clave) do nothing;

-- Elegir qué terminal escucha, sin dejar dos ni ninguna.
--
-- Son dos escrituras que tienen que pasar juntas —apagar la anterior y
-- prender la nueva—: el índice no tolera dos, y quedarse sin ninguna
-- deja a los mostradores hablándole a nadie el día que se corte
-- internet.
create or replace function public.marcar_punto_de_encuentro(p_terminal_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.terminal
     where id = p_terminal_id and activo and eliminado_en is null
  ) then
    raise exception 'Esa terminal no existe o está dada de baja.';
  end if;

  update public.terminal set es_punto_de_encuentro = false
   where es_punto_de_encuentro and id <> p_terminal_id;

  update public.terminal set es_punto_de_encuentro = true
   where id = p_terminal_id and not es_punto_de_encuentro;
end;
$$;

comment on function public.marcar_punto_de_encuentro is
  'Cambia cuál terminal escucha a las demás sin internet. Las dos escrituras van juntas: dos puntos de encuentro parten el local en dos, y ninguno lo deja sin camino.';

grant execute on function public.marcar_punto_de_encuentro(uuid) to authenticated;
