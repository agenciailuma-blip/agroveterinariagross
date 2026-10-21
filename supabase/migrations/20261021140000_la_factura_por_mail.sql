-- ═══════════════════════════════════════════════════════════════
-- La factura por mail
--
-- Pedido 17 de Lucas, decidido el 21/10: un botón «Mandar por mail» en
-- la factura —para el cliente de cuenta corriente— y el envío solo
-- cuando se factura un pedido de la tienda. Sale con la factura en PDF,
-- por Resend (la función enviar-factura).
--
-- Acá queda:
--   · el registro de cada envío: a quién, cuándo, quién lo mandó, si
--     salió o qué dijo el servicio. Es lo que la factura muestra, y lo
--     que permite contestar «¿le llegó?»;
--   · el remitente y el «responder a», en la configuración. Mientras el
--     dominio agroveterinariagross.com.ar no esté verificado en Resend,
--     el remitente es la dirección de prueba de Resend, que sólo puede
--     mandar a la casilla de la cuenta. El día que se verifica, se cambia
--     acá y empieza a llegarle a los clientes, sin publicar nada.
-- ═══════════════════════════════════════════════════════════════

create table public.comprobante_envio (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references public.comprobante(id) on delete cascade,
  destinatario    text not null,
  estado          text not null check (estado in ('enviado', 'error')),
  -- El número que le da el servicio de correo al mail: para rastrearlo allá.
  referencia      text,
  error           text,
  -- Solo, al facturar un pedido de la tienda; o a mano, con el botón.
  automatico      boolean not null default false,
  enviado_por     uuid references public.usuario(id),
  creado_en       timestamptz not null default now()
);

create index comprobante_envio_comprobante_idx on public.comprobante_envio (comprobante_id, creado_en desc);

comment on table public.comprobante_envio is
  'Cada vez que una factura se mandó (o se intentó mandar) por mail. Lo escribe la función enviar-factura.';

alter table public.comprobante_envio enable row level security;

create policy comprobante_envio_ver on public.comprobante_envio
  for select to authenticated
  using (app.tiene_permiso('facturacion.ver'));

-- Se escribe sólo desde la función del servidor, con su llave.
revoke insert, update, delete on public.comprobante_envio from anon, authenticated;

insert into public.configuracion (clave, valor, grupo, descripcion) values
  ('correo.remitente', to_jsonb('Agroveterinaria Gross <onboarding@resend.dev>'::text), 'correo',
   'Desde qué dirección salen las facturas por mail. Hasta que el dominio esté verificado en Resend, la de prueba: sólo llega a la casilla de la cuenta.'),
  ('correo.responder_a', to_jsonb(''::text), 'correo',
   'A qué casilla le llega si el cliente contesta el mail de la factura. Vacío: al remitente.')
on conflict (clave) do nothing;
