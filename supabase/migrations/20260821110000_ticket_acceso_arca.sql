-- ═══════════════════════════════════════════════════════════════
-- 024 — TICKET DE ACCESO DE WSAA (CACHE)
--
-- El token que devuelve WSAA dura 12 horas. Pedirlo en cada factura
-- sería una vuelta innecesaria a ARCA (y una firma CMS de más) por
-- cada comprobante. Se cachea acá y la Edge Function lo reusa hasta
-- que esté por vencer.
--
-- No es una tabla de negocio: solo la usa el servicio de facturación,
-- con la service role (que ignora RLS). No se le da ninguna policy a
-- 'authenticated' a propósito — nadie del sistema necesita leer un
-- token de ARCA desde el navegador.
-- ═══════════════════════════════════════════════════════════════

create table public.arca_ticket_acceso (
  servicio    text not null,
  ambiente    text not null check (ambiente in ('homologacion', 'produccion')),
  token       text not null,
  sign        text not null,
  generado_en timestamptz not null,
  expira_en   timestamptz not null,
  primary key (servicio, ambiente)
);

comment on table public.arca_ticket_acceso is
  'Cache del Ticket de Acceso (token+sign) que devuelve WSAA, válido 12 h. Solo lo usa la Edge Function de facturación con la service role; sin políticas para authenticated a propósito.';

alter table public.arca_ticket_acceso enable row level security;
