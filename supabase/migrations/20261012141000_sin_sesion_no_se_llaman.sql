-- ═══════════════════════════════════════════════════════════════
-- Sin sesión, estas funciones no se pueden llamar
--
-- El revisor de seguridad de Supabase avisó, al sumar el pedido a
-- proveedor, que funciones con permiso de dueño se podían llamar sin
-- haber iniciado sesión. `revoke ... from public` no alcanza: Supabase
-- le da permiso a `anon` por separado. No eran una puerta abierta —todas
-- controlan el permiso de la persona adentro, y sin sesión no hay
-- persona—, pero no tienen por qué estar a la vista.
--
-- Quedan afuera, a propósito, las de la API de la tienda: entra con su
-- clave, sin sesión.
--
-- Y las dos de los avisos de stock fijan el search_path, como todas las
-- demás: el cuerpo ya nombraba la tabla con su esquema.
-- ═══════════════════════════════════════════════════════════════

revoke execute on function
  public.productos_para_pedido(uuid),
  public.hacer_pedido_proveedor(uuid, uuid, jsonb, text),
  public.anular_pedido_proveedor(uuid, text),
  public.pedidos_a_proveedores(text, int),
  public.pedido_a_proveedor(uuid),
  public.crear_sector(text),
  public.guardar_orden_interna(uuid, uuid, uuid, jsonb, date, text, uuid, text),
  public.marcar_orden_interna(uuid, boolean),
  public.anular_orden_interna(uuid, text),
  public.ordenes_internas(text, int),
  public.orden_interna(uuid),
  public.definir_umbral_general(numeric, numeric),
  public.movimientos_de_producto(uuid, uuid, int),
  public.aumentar_precios(numeric, uuid, uuid, text, text),
  public.revertir_aumento(uuid)
from anon;

alter function public.definir_umbral_producto(uuid, numeric, numeric) set search_path = '';
alter function public.definir_umbral_categoria(uuid, numeric, numeric) set search_path = '';
