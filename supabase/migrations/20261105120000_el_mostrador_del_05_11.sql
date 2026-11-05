-- ─────────────────────────────────────────────────────────────
-- El mostrador, después de la reunión del 05/11
--
-- Mirando el mostrador en uso salieron dos cosas que tocan la base:
--
-- 1. El alimento suelto no se podía vender por 0,5 kg. No era la
--    pantalla: los 2.281 productos se importaron con unidad «unidad»,
--    y una unidad no se parte. Los que se venden por kilo o por litro
--    —el nombre dice «x kg» o «x LT» sin un número delante— pasan a
--    kilo y a litro. «x 15 kg» es una bolsa: sigue siendo unidad.
--    Además, la opción «Decimales en todos los productos», que pidió
--    Lucas, apagada hasta que él la prenda.
--
-- 2. «Accesorios varios» es la pelotita, el silbato y la correa, cada
--    uno con su precio. Agregarlo dos veces sumaba cantidad al mismo
--    renglón. La marca «precio en cada venta» pregunta el precio al
--    agregarlo y abre un renglón cada vez.
-- ─────────────────────────────────────────────────────────────

alter table public.producto
  add column precio_en_cada_venta boolean not null default false;

comment on column public.producto.precio_en_cada_venta is
  'Producto que representa muchos de la góndola (Accesorios varios): el precio se pregunta al venderlo y cada uno va en su renglón.';

-- Los «varios» con precio de relleno (0, 1 o 99,99): son justamente
-- los que se venden poniendo el precio. El resto lo marca Lucas desde
-- la ficha.
update public.producto
set precio_en_cada_venta = true
where eliminado_en is null
  and nombre_interno ~* '\mvarios\M'
  and precio_venta < 100;

-- Por kilo o por litro: «x kg», «x  Kg», «x LT», «suelto x kg», sin
-- número entre la x y la unidad.
update public.producto
set unidad_medida = case when nombre_interno ~* '\mx\s*(lt|litro)s?\M' then 'litro' else 'kg' end
where eliminado_en is null
  and unidad_medida = 'unidad'
  and nombre_interno ~* '\mx\s*(kg|kilo|lt|litro)s?\M';

insert into public.configuracion (clave, valor, descripcion, grupo)
values ('ventas.decimales_en_todos',
        to_jsonb(0),
        'Si es 1, el mostrador acepta cantidades con decimales en cualquier producto, no sólo en los que se venden por kilo, litro o metro.',
        'ventas')
on conflict (clave) do nothing;
