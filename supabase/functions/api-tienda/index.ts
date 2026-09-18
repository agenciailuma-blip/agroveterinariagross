import { CABECERAS, cuerpoDeError, interpretarErrorDeLaBase, interpretarPedido } from "./reglas.ts";

// ═══════════════════════════════════════════════════════════════
// API DE LA TIENDA ONLINE — la puerta
//
// La tienda de Zubu lee el catálogo por acá: GET /catalogo y
// GET /clasificaciones, con su clave en Authorization: Bearer.
// Documentación para ellos: docs/api-tienda.md.
//
// Se despliega con verify_jwt = false porque la clave de Zubu no es
// un token de inicio de sesión de Supabase: Zubu no es un usuario del
// sistema. La clave la valida la base.
//
// La puerta entra a la base con la LLAVE PÚBLICA (anon), no con la de
// servicio. Es a propósito: anon no lee ninguna tabla, y lo único que
// puede ejecutar son las dos funciones de la API. Si esta puerta
// tuviera un error, no tiene con qué llegar a los costos ni a los
// clientes. Con la llave de servicio, un error acá lo vería todo.
// ═══════════════════════════════════════════════════════════════

const BASE = Deno.env.get("SUPABASE_URL")!;
const LLAVE_PUBLICA = Deno.env.get("SUPABASE_ANON_KEY")!;

function responder(estado: number, cuerpo: string, extra: Record<string, string> = {}): Response {
  return new Response(cuerpo, { status: estado, headers: { ...CABECERAS, ...extra } });
}

Deno.serve(async (pedido: Request) => {
  const consulta = interpretarPedido(pedido.method, new URL(pedido.url), pedido.headers.get("authorization"));

  if (consulta.tipo === "error") {
    return responder(
      consulta.estado,
      JSON.stringify(cuerpoDeError(consulta.codigo, consulta.detalle)),
      consulta.codigo === "metodo_no_permitido" ? { Allow: "GET" } : {},
    );
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}/rest/v1/rpc/${consulta.funcion}`, {
      // POST y no GET: la base anota el último uso de la clave, y
      // PostgREST corre los GET en una transacción de sólo lectura.
      method: "POST",
      headers: {
        apikey: LLAVE_PUBLICA,
        Authorization: `Bearer ${LLAVE_PUBLICA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(consulta.argumentos),
    });
  } catch (e) {
    console.error("api-tienda: no se pudo hablar con la base", e);
    return responder(500, JSON.stringify(cuerpoDeError("error_interno")));
  }

  const texto = await respuesta.text();
  if (respuesta.ok) return responder(200, texto);

  let cuerpo: { code?: string; message?: string } | null = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = null;
  }

  const { estado, codigo } = interpretarErrorDeLaBase(cuerpo);
  // Se anota lo inesperado —nunca la clave, que va en el cuerpo del
  // pedido a la base y no en lo que se registra—.
  if (codigo === "error_interno") {
    console.error("api-tienda: la base contestó", respuesta.status, texto);
  }
  return responder(estado, JSON.stringify(cuerpoDeError(codigo)));
});
