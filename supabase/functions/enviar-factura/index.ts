import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { armarMail, armarMailPedido, correoValido, errorDelCorreo, nombreDelPdf, pdfValido } from "./reglas.ts";

// ═══════════════════════════════════════════════════════════════
// Mandar la factura por mail
//
// Pedido 17 de Lucas, decidido el 21/10: el botón «Mandar por mail» de
// la factura, y el envío solo al facturar un pedido de la tienda.
//
// La app arma el PDF —el mismo que la hoja A4 que se imprime, con los
// mismos datos— y esta función lo manda por Resend y anota el envío en
// comprobante_envio. Lo que se manda lo decide el servidor, no la app:
// la factura tiene que existir y estar autorizada, el asunto y el nombre
// del archivo salen de ella, y el remitente, de la configuración.
//
// También manda el recibo de una cobranza (Fase 03, 5.4): con recibo_id
// en vez de comprobante_id. Mismo correo, mismo PDF armado en la app;
// el envío queda anotado en el recibo.
//
// Y el pedido mayorista (5.3), con pedido_id: apenas llega al local, al
// cliente le llega el detalle. Sin PDF; el mail lo arma el servidor con
// lo que hay en la base. Queda anotado en el pedido.
//
// La clave de Resend está en los secretos del proyecto (RESEND_API_KEY)
// y nunca sale de acá. Contesta antes de los 35 segundos que la app le
// espera: Resend tiene veinte.
// ═══════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const RESEND = "https://api.resend.com/emails";
const ESPERA_MS = 20000;

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ ok: false, error: "Sólo POST." }, 405);

  const servidor = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Los permisos se miran como el usuario que aprieta el botón.
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const body = await req.json().catch(() => ({}));
    const reciboId = body.recibo_id ? String(body.recibo_id) : null;
    if (body.pedido_id) return await mandarPedido(servidor, comoUsuario, body);

    // El recibo lo manda quien cobra o ve las cuentas; la factura, quien ve la facturación.
    const permisos = reciboId ? ["cuentacorriente.cobrar", "cuentacorriente.ver"] : ["facturacion.ver"];
    let puede = false;
    for (const clave of permisos) {
      const r = await comoUsuario.rpc("tiene_permiso", { p_clave: clave });
      if (r.data) {
        puede = true;
        break;
      }
    }
    if (!puede) {
      return responder({
        ok: false,
        motivo: "sin_permiso",
        error: reciboId ? "No tenés permiso para mandar recibos." : "No tenés permiso para mandar facturas.",
      }, 403);
    }

    const comprobanteId = String(body.comprobante_id ?? "");
    const destinatario = String(body.destinatario ?? "").trim();
    const automatico = body.automatico === true;

    if (!correoValido(destinatario)) {
      return responder({ ok: false, motivo: "correo", error: "Esa dirección de correo no es válida." }, 400);
    }
    let pdf: Uint8Array;
    try {
      pdf = decodeBase64(String(body.pdf ?? ""));
    } catch {
      pdf = new Uint8Array();
    }
    if (!pdfValido(pdf)) {
      return responder({ ok: false, motivo: "pdf", error: `No llegó bien el PDF ${reciboId ? "del recibo" : "de la factura"}. Probá de nuevo.` }, 400);
    }

    if (reciboId) return await mandarRecibo(servidor, reciboId, destinatario, String(body.pdf));

    const { data: c } = await servidor
      .from("comprobante")
      .select(`id, numero, fecha, total, cae, receptor_nombre,
               tipo:tipo_comprobante_id(descripcion), pv:punto_venta_id(numero)`)
      .eq("id", comprobanteId)
      .maybeSingle();
    if (!c) return responder({ ok: false, motivo: "comprobante", error: "No se encontró la factura." }, 404);
    if (!c.cae) {
      return responder({ ok: false, motivo: "sin_cae", error: "La factura todavía no tiene CAE: sin autorización de ARCA no se manda." }, 409);
    }

    const clave = Deno.env.get("RESEND_API_KEY");
    if (!clave) return responder({ ok: false, motivo: "sin_clave", error: "Falta la clave de Resend en el servidor." }, 503);

    const { data: config } = await servidor
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["correo.remitente", "correo.responder_a", "correo.logo", "comercio.nombre_fantasia", "comercio.razon_social",
        "comercio.domicilio", "comercio.localidad", "comercio.telefono"]);
    const valor = (k: string) => String(config?.find((x) => x.clave === k)?.valor ?? "").trim();

    const tipo = (uno(c.tipo as never) as { descripcion: string } | null)?.descripcion ?? "Factura";
    const numero = `${String((uno(c.pv as never) as { numero: number } | null)?.numero ?? 0).padStart(4, "0")}-${String(c.numero).padStart(8, "0")}`;
    const responderA = valor("correo.responder_a");
    const mail = armarMail({
      tipo,
      numero,
      fecha: String(c.fecha ?? ""),
      total: Number(c.total),
      receptor: String(c.receptor_nombre ?? ""),
      comercio: valor("comercio.nombre_fantasia") || valor("comercio.razon_social") || "Agroveterinaria Gross",
      domicilio: [valor("comercio.domicilio"), valor("comercio.localidad")].filter(Boolean).join(", "),
      telefono: valor("comercio.telefono"),
      // El isotipo en blanco, publicado con la web de la app. Se puede
      // cambiar en la configuración (correo.logo) el día del dominio propio.
      logo: valor("correo.logo") || "https://gross-sistema.pages.dev/marca/correo-isotipo-blanco.png",
      respondible: !!responderA,
    });

    const r = await fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: valor("correo.remitente") || "Agroveterinaria Gross <onboarding@resend.dev>",
        to: [destinatario],
        ...(responderA ? { reply_to: responderA } : {}),
        subject: mail.asunto,
        html: mail.html,
        text: mail.texto,
        attachments: [{ filename: nombreDelPdf({ tipo, numero }), content: String(body.pdf) }],
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    const respuesta = await r.json().catch(() => ({}));

    const { data: auth } = await comoUsuario.auth.getUser();
    const usuario = auth?.user
      ? (await servidor.from("usuario").select("id").eq("auth_user_id", auth.user.id).maybeSingle()).data?.id ?? null
      : null;

    const error = r.ok ? null : errorDelCorreo(r.status, String(respuesta?.message ?? respuesta?.error ?? ""));
    await servidor.from("comprobante_envio").insert({
      comprobante_id: comprobanteId,
      destinatario,
      estado: r.ok ? "enviado" : "error",
      referencia: r.ok ? String(respuesta?.id ?? "") : null,
      error,
      automatico,
      enviado_por: usuario,
    });

    if (!r.ok) return responder({ ok: false, motivo: "correo_rechazo", error }, 502);
    return responder({ ok: true, referencia: respuesta?.id ?? null });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return responder({ ok: false, motivo: "correo_no_responde", error: "El servicio de correo no contesta. Probá en un rato." }, 503);
    }
    console.error("enviar-factura:", err);
    return responder({ ok: false, motivo: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ───────────────────────────────────────────────────────────────
// El recibo
// ───────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type Cliente = any;

async function mandarRecibo(
  servidor: Cliente,
  reciboId: string,
  destinatario: string,
  pdfBase64: string,
): Promise<Response> {
  const { data: r } = await servidor
    .from("recibo")
    .select("id, serie, numero, fecha, total, cliente:cliente_id(nombre)")
    .eq("id", reciboId)
    .maybeSingle();
  if (!r) return responder({ ok: false, motivo: "recibo", error: "No se encontró el recibo." }, 404);

  const clave = Deno.env.get("RESEND_API_KEY");
  if (!clave) return responder({ ok: false, motivo: "sin_clave", error: "Falta la clave de Resend en el servidor." }, 503);

  const { data: config } = await servidor
    .from("configuracion")
    .select("clave, valor")
    .in("clave", ["correo.remitente", "correo.responder_a", "correo.logo", "comercio.nombre_fantasia", "comercio.razon_social",
      "comercio.domicilio", "comercio.localidad", "comercio.telefono"]);
  const valor = (k: string) => String((config as { clave: string; valor: unknown }[] | null)?.find((x) => x.clave === k)?.valor ?? "").trim();

  const numero = `${r.serie}-${String(r.numero).padStart(8, "0")}`;
  const responderA = valor("correo.responder_a");
  const mail = armarMail({
    tipo: "Recibo",
    numero,
    fecha: String(r.fecha ?? ""),
    total: Number(r.total),
    receptor: String((uno(r.cliente as never) as { nombre: string } | null)?.nombre ?? ""),
    comercio: valor("comercio.nombre_fantasia") || valor("comercio.razon_social") || "Agroveterinaria Gross",
    domicilio: [valor("comercio.domicilio"), valor("comercio.localidad")].filter(Boolean).join(", "),
    telefono: valor("comercio.telefono"),
    logo: valor("correo.logo") || "https://gross-sistema.pages.dev/marca/correo-isotipo-blanco.png",
    respondible: !!responderA,
    esRecibo: true,
  });

  const respuesta = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: valor("correo.remitente") || "Agroveterinaria Gross <onboarding@resend.dev>",
      to: [destinatario],
      ...(responderA ? { reply_to: responderA } : {}),
      subject: mail.asunto,
      html: mail.html,
      text: mail.texto,
      attachments: [{ filename: nombreDelPdf({ tipo: "Recibo", numero }), content: pdfBase64 }],
    }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  const error = respuesta.ok ? null : errorDelCorreo(respuesta.status, String(cuerpo?.message ?? cuerpo?.error ?? ""));

  await servidor.from("recibo").update({
    mail_destinatario: destinatario,
    mail_estado: respuesta.ok ? "enviado" : "error",
    mail_error: error,
    mail_en: new Date().toISOString(),
  }).eq("id", reciboId);

  if (!respuesta.ok) return responder({ ok: false, motivo: "correo_rechazo", error }, 502);
  return responder({ ok: true, referencia: cuerpo?.id ?? null });
}

// ───────────────────────────────────────────────────────────────
// El pedido mayorista
// ───────────────────────────────────────────────────────────────

/*
  Lo manda el teléfono del vendedor apenas el pedido llega (automatico),
  o el local desde la ficha. Quién puede lo decide la base: el pedido
  se lee como el usuario, y sólo lo ve quien atiende los pedidos o el
  vendedor que lo armó. A falta de dirección, la del cliente.
*/
async function mandarPedido(
  servidor: Cliente,
  comoUsuario: Cliente,
  // deno-lint-ignore no-explicit-any
  body: any,
): Promise<Response> {
  const pedidoId = String(body.pedido_id);
  const automatico = body.automatico === true;

  const { data: visible } = await comoUsuario.from("pedido_mayorista").select("id").eq("id", pedidoId).maybeSingle();
  if (!visible) {
    return responder({ ok: false, motivo: "sin_permiso", error: "No tenés permiso para mandar este pedido." }, 403);
  }

  const { data: p } = await servidor
    .from("pedido_mayorista")
    .select(`id, numero, armado_en, observaciones, mail_estado,
             cliente:cliente_id(nombre, email), vendedor:vendedor_id(nombre),
             lineas:pedido_mayorista_linea(orden, cantidad, precio, producto:producto_id(nombre_interno))`)
    .eq("id", pedidoId)
    .maybeSingle();
  if (!p) return responder({ ok: false, motivo: "pedido", error: "No se encontró el pedido." }, 404);

  // El teléfono puede reintentar un pedido que ya había llegado: no se manda dos veces solo.
  if (automatico && p.mail_estado === "enviado") return responder({ ok: true, repetido: true });

  const cliente = uno(p.cliente as never) as { nombre: string; email: string | null } | null;
  const destinatario = String(body.destinatario ?? "").trim() || String(cliente?.email ?? "").trim();
  if (!destinatario) {
    return responder({ ok: false, motivo: "sin_correo", error: "El cliente no tiene mail cargado." }, 409);
  }
  if (!correoValido(destinatario)) {
    return responder({ ok: false, motivo: "correo", error: "Esa dirección de correo no es válida." }, 400);
  }

  const clave = Deno.env.get("RESEND_API_KEY");
  if (!clave) return responder({ ok: false, motivo: "sin_clave", error: "Falta la clave de Resend en el servidor." }, 503);

  const { data: config } = await servidor
    .from("configuracion")
    .select("clave, valor")
    .in("clave", ["correo.remitente", "correo.responder_a", "correo.logo", "comercio.nombre_fantasia", "comercio.razon_social",
      "comercio.domicilio", "comercio.localidad", "comercio.telefono"]);
  const valor = (k: string) => String((config as { clave: string; valor: unknown }[] | null)?.find((x) => x.clave === k)?.valor ?? "").trim();

  const lineas = ((p.lineas ?? []) as { orden: number; cantidad: number; precio: number; producto: unknown }[])
    .sort((a, b) => a.orden - b.orden)
    .map((l) => ({
      nombre: String((uno(l.producto as never) as { nombre_interno: string } | null)?.nombre_interno ?? ""),
      cantidad: Number(l.cantidad),
      precio: Number(l.precio),
    }));
  const responderA = valor("correo.responder_a");
  const mail = armarMailPedido({
    numero: Number(p.numero),
    // El día en la Argentina, no en el reloj del servidor.
    fecha: new Date(p.armado_en).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
    receptor: String(cliente?.nombre ?? ""),
    vendedor: (uno(p.vendedor as never) as { nombre: string } | null)?.nombre ?? null,
    lineas,
    total: lineas.reduce((t, l) => t + Math.round(l.cantidad * l.precio * 100) / 100, 0),
    observaciones: p.observaciones ?? null,
    comercio: valor("comercio.nombre_fantasia") || valor("comercio.razon_social") || "Agroveterinaria Gross",
    domicilio: [valor("comercio.domicilio"), valor("comercio.localidad")].filter(Boolean).join(", "),
    telefono: valor("comercio.telefono"),
    logo: valor("correo.logo") || "https://gross-sistema.pages.dev/marca/correo-isotipo-blanco.png",
    respondible: !!responderA,
  });

  const respuesta = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: valor("correo.remitente") || "Agroveterinaria Gross <onboarding@resend.dev>",
      to: [destinatario],
      ...(responderA ? { reply_to: responderA } : {}),
      subject: mail.asunto,
      html: mail.html,
      text: mail.texto,
    }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  const error = respuesta.ok ? null : errorDelCorreo(respuesta.status, String(cuerpo?.message ?? cuerpo?.error ?? ""));

  await servidor.from("pedido_mayorista").update({
    mail_destinatario: destinatario,
    mail_estado: respuesta.ok ? "enviado" : "error",
    mail_error: error,
    mail_en: new Date().toISOString(),
  }).eq("id", pedidoId);

  if (!respuesta.ok) return responder({ ok: false, motivo: "correo_rechazo", error }, 502);
  return responder({ ok: true, referencia: cuerpo?.id ?? null });
}
