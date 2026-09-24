import {
  CABECERAS,
  cuerpoDeError,
  interpretarCuerpoDelPedido,
  interpretarErrorDeLaBase,
  interpretarPedido,
} from "./reglas.ts";

// ═══════════════════════════════════════════════════════════════
// API DE LA TIENDA ONLINE — la puerta
//
// La tienda lee el catálogo por acá —GET /catalogo y
// GET /clasificaciones— y manda las compras por POST /pedidos, con su
// clave en Authorization: Bearer. Documentación: docs/api-tienda.md.
//
// Se despliega con verify_jwt = false porque la clave de la tienda no
// es un token de inicio de sesión de Supabase: la tienda no es un
// usuario del sistema. La clave la valida la base.
//
// La puerta entra a la base con la LLAVE PÚBLICA (anon), no con la de
// servicio. Es a propósito: anon no lee ninguna tabla, y lo único que
// puede ejecutar son las funciones de la API. Si esta puerta tuviera
// un error, no tiene con qué llegar a los costos ni a los clientes.
// Con la llave de servicio, un error acá lo vería todo.
// ═══════════════════════════════════════════════════════════════

const BASE = Deno.env.get("SUPABASE_URL")!;
const LLAVE_PUBLICA = Deno.env.get("SUPABASE_ANON_KEY")!;

function responder(estado: number, cuerpo: string, extra: Record<string, string> = {}): Response {
  return new Response(cuerpo, { status: estado, headers: { ...CABECERAS, ...extra } });
}

function responderError(estado: number, codigo: Parameters<typeof cuerpoDeError>[0], detalle?: string, extra: Record<string, string> = {}) {
  return responder(estado, JSON.stringify(cuerpoDeError(codigo, detalle)), extra);
}

Deno.serve(async (pedido: Request) => {
  const consulta = interpretarPedido(pedido.method, new URL(pedido.url), pedido.headers.get("authorization"));

  if (consulta.tipo === "error") {
    return responderError(
      consulta.estado,
      consulta.codigo,
      // El método permitido se contesta en el encabezado Allow, que es
      // donde lo busca un cliente HTTP, y no sólo en el mensaje.
      consulta.codigo === "metodo_no_permitido" ? undefined : consulta.detalle,
      consulta.codigo === "metodo_no_permitido" ? { Allow: consulta.detalle ?? "GET" } : {},
    );
  }

  let argumentos: Record<string, unknown>;
  if (consulta.tipo === "pedido") {
    let texto: string;
    try {
      texto = await pedido.text();
    } catch (e) {
      console.error("api-tienda: no se pudo leer el cuerpo del pedido", e);
      return responderError(400, "cuerpo_invalido");
    }
    const cuerpo = interpretarCuerpoDelPedido(texto);
    if (cuerpo.tipo === "error") return responderError(cuerpo.estado, cuerpo.codigo, cuerpo.detalle);
    argumentos = { p_clave: consulta.clave, p_pedido: cuerpo.pedido };
  } else {
    argumentos = consulta.argumentos;
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}/rest/v1/rpc/${consulta.funcion}`, {
      // POST y no GET también para leer: la base anota el último uso de
      // la clave, y PostgREST corre los GET en una transacción de sólo
      // lectura.
      method: "POST",
      headers: {
        apikey: LLAVE_PUBLICA,
        Authorization: `Bearer ${LLAVE_PUBLICA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(argumentos),
    });
  } catch (e) {
    console.error("api-tienda: no se pudo hablar con la base", e);
    return responderError(500, "error_interno");
  }

  const texto = await respuesta.text();
  if (respuesta.ok) return responder(200, texto);

  let cuerpo: { code?: string; message?: string; details?: string } | null = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = null;
  }

  const { estado, codigo, detalle } = interpretarErrorDeLaBase(cuerpo);
  // Se anota lo inesperado —nunca la clave, que va en el cuerpo del
  // pedido a la base y no en lo que se registra—.
  if (codigo === "error_interno") {
    console.error("api-tienda: la base contestó", respuesta.status, texto);
  }
  return responderError(estado, codigo, detalle);
});
