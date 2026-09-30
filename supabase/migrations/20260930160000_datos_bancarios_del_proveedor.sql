-- ═══════════════════════════════════════════════════════════════
-- LOS DATOS BANCARIOS DEL PROVEEDOR
--
-- Pedido por Francisco el 30/09, visto en otros sistemas: para
-- transferirle a un proveedor sin pedirle cada vez adónde. Va en su
-- ficha, y al registrar un pago por transferencia aparece listo para
-- copiar.
--
-- · El CBU (banco) y el CVU (billetera virtual) son lo mismo para el
--   sistema: 22 dígitos con dos dígitos verificadores. Se guarda sólo
--   el número, sin espacios ni guiones.
-- · El alias es lo que se dicta por teléfono: de 6 a 20 caracteres,
--   letras, números, puntos y guiones.
--
-- La base controla los dígitos verificadores: un CBU con un número
-- cambiado es una transferencia a otra persona, y esa plata no vuelve
-- sola. Es la misma cuenta que hacen los bancos antes de transferir.
-- ═══════════════════════════════════════════════════════════════

/*
  Los dos dígitos verificadores del CBU (y del CVU, que usa la misma
  cuenta):
  · el 8.º verifica los 7 primeros (banco y sucursal), con los pesos
    7 1 3 9 7 1 3;
  · el 22.º verifica del 9.º al 21.º (la cuenta), con los pesos
    3 9 7 1 3 9 7 1 3 9 7 1 3.
  En los dos, el dígito es lo que le falta a la suma para llegar a la
  próxima decena.
*/
create or replace function app.cbu_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v       text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  v_pesos int[] := array[7, 1, 3, 9, 7, 1, 3];
  v_largo int[] := array[3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  v_suma  int := 0;
begin
  if length(v) <> 22 then
    return false;
  end if;

  for i in 1..7 loop
    v_suma := v_suma + substr(v, i, 1)::int * v_pesos[i];
  end loop;
  if (10 - v_suma % 10) % 10 <> substr(v, 8, 1)::int then
    return false;
  end if;

  v_suma := 0;
  for i in 1..13 loop
    v_suma := v_suma + substr(v, 8 + i, 1)::int * v_largo[i];
  end loop;
  return (10 - v_suma % 10) % 10 = substr(v, 22, 1)::int;
end;
$$;

comment on function app.cbu_valido is
  'Si un CBU o CVU tiene 22 dígitos y sus dos dígitos verificadores cierran.';

alter table public.proveedor
  add column cbu   text,
  add column alias text;

alter table public.proveedor add constraint proveedor_cbu_valido
  check (cbu is null or (cbu ~ '^\d{22}$' and app.cbu_valido(cbu)));

alter table public.proveedor add constraint proveedor_alias_valido
  check (alias is null or alias ~ '^[A-Za-z0-9.\-]{6,20}$');

comment on column public.proveedor.cbu is
  'CBU o CVU para transferirle, los 22 dígitos sin separadores. Los CVU empiezan con 000.';
comment on column public.proveedor.alias is
  'Alias de la cuenta para transferirle, como lo da el banco.';
