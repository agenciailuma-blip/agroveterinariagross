import { createClient } from "npm:@supabase/supabase-js@2";
import { correoValido, errorDeLaCuenta, esAccion, problemaDeLaClave } from "./reglas.ts";

// ═══════════════════════════════════════════════════════════════
// Las cuentas de acceso, desde la pantalla de Usuarios
//
// Pedido del 12/11: que Lucas cree, administre y elimine usuarios sin
// entrar a Supabase. La fila de public.usuario —nombre, rol, PIN— ya se
// manejaba desde la app; lo que faltaba era la cuenta con la que se
// inicia sesión (auth.users), que sólo se crea con la clave de
// administrador del proyecto. Esa clave vive acá y nunca sale.
//
// Acciones, todas con usuario_id:
//   dar_acceso          crea la cuenta con el correo de la ficha y la
//                       contraseña que elige quien administra. Queda
//                       confirmada y vinculada: la persona entra ya. Si
//                       ya había una cuenta suelta con ese correo (creada
//                       a mano en Supabase), la toma y le pone la clave.
//   cambiar_clave       una contraseña nueva, para el que se la olvidó.
//   quitar_acceso       borra la cuenta; la persona queda con su rol y su
//                       PIN, pero ya no inicia sesión.
//   eliminar            da de baja a la persona y borra su cuenta. Lo que
//                       hizo queda registrado con su nombre.
//   sincronizar_correo  si se corrigió el correo en la ficha, la cuenta
//                       pasa a entrar con el nuevo.
//
// Lo puede hacer quien tiene usuarios.gestionar. Nadie se quita el
// acceso ni se elimina a sí mismo, y la base sigue impidiendo quedarse
// sin administrador (app.proteger_ultimo_administrador).
// ═══════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const falla = (error: string, status = 400) => responder({ ok: false, error }, status);

// deno-lint-ignore no-explicit-any
type Cliente = any;

interface Ficha {
  id: string;
  nombre: string;
  email: string | null;
  auth_user_id: string | null;
  activo: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return falla("Sólo POST.", 405);

  const servidor: Cliente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const comoUsuario: Cliente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  try {
    const { data: puede } = await comoUsuario.rpc("tiene_permiso", { p_clave: "usuarios.gestionar" });
    if (!puede) return falla("No tenés permiso para administrar usuarios.", 403);

    const { data: auth } = await comoUsuario.auth.getUser();
    const yo = auth?.user?.id ?? null;

    const body = await req.json().catch(() => ({}));
    const accion = body.accion;
    if (!esAccion(accion)) return falla("No sé qué hacer con eso.");

    const { data: ficha } = await servidor
      .from("usuario")
      .select("id, nombre, email, auth_user_id, activo")
      .eq("id", String(body.usuario_id ?? ""))
      .is("eliminado_en", null)
      .maybeSingle();
    if (!ficha) return falla("No se encontró a esa persona.", 404);
    const u = ficha as Ficha;
    const esUnoMismo = !!yo && u.auth_user_id === yo;

    switch (accion) {
      case "dar_acceso":
        return await darAcceso(servidor, u, String(body.clave ?? ""));
      case "cambiar_clave":
        return await cambiarClave(servidor, u, String(body.clave ?? ""));
      case "quitar_acceso":
        if (esUnoMismo) return falla("No podés quitarte el acceso a vos mismo.");
        return await quitarAcceso(servidor, u);
      case "eliminar":
        if (esUnoMismo) return falla("No podés eliminarte a vos mismo.");
        return await eliminar(servidor, u);
      case "sincronizar_correo":
        return await sincronizarCorreo(servidor, u);
    }
  } catch (err) {
    console.error("administrar-usuarios:", err);
    return falla(err instanceof Error ? err.message : String(err), 500);
  }
});

/* Busca una cuenta por correo. Son pocas: alcanza con recorrerlas. */
async function cuentaPorCorreo(servidor: Cliente, correo: string): Promise<{ id: string } | null> {
  const buscado = correo.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await servidor.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = (data?.users ?? []) as { id: string; email?: string }[];
    const hallada = users.find((x) => (x.email ?? "").toLowerCase() === buscado);
    if (hallada) return { id: hallada.id };
    if (users.length < 200) return null;
  }
  return null;
}

async function darAcceso(servidor: Cliente, u: Ficha, clave: string): Promise<Response> {
  if (u.auth_user_id) return cambiarClave(servidor, u, clave);
  const correo = (u.email ?? "").trim();
  if (!correo) return falla("Cargale un correo en la ficha: es con lo que va a entrar.");
  if (!correoValido(correo)) return falla("El correo de la ficha no es válido.");
  if (!u.activo) return falla("Está marcada como inactiva: activala antes de darle acceso.");
  const problema = problemaDeLaClave(clave);
  if (problema) return falla(problema);

  let cuentaId: string;
  const creada = await servidor.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
  if (creada.error) {
    if (!/already (been )?registered|already exists/i.test(creada.error.message)) {
      return falla(errorDeLaCuenta(creada.error.message));
    }
    // Una cuenta hecha a mano en Supabase, todavía sin vincular: se toma.
    const suelta = await cuentaPorCorreo(servidor, correo);
    if (!suelta) return falla(errorDeLaCuenta(creada.error.message));
    const { data: deOtro } = await servidor.from("usuario").select("nombre").eq("auth_user_id", suelta.id).maybeSingle();
    if (deOtro) return falla(`Ese correo ya es la cuenta de ${deOtro.nombre}.`);
    const { error } = await servidor.auth.admin.updateUserById(suelta.id, { password: clave, email_confirm: true });
    if (error) return falla(errorDeLaCuenta(error.message));
    cuentaId = suelta.id;
  } else {
    cuentaId = creada.data.user.id;
  }

  const { error } = await servidor.from("usuario").update({ auth_user_id: cuentaId }).eq("id", u.id);
  if (error) return falla(`La cuenta se creó pero no se pudo vincular: ${error.message}`, 500);
  return responder({ ok: true });
}

async function cambiarClave(servidor: Cliente, u: Ficha, clave: string): Promise<Response> {
  if (!u.auth_user_id) return falla("Todavía no tiene acceso: dáselo primero.");
  const problema = problemaDeLaClave(clave);
  if (problema) return falla(problema);
  const { error } = await servidor.auth.admin.updateUserById(u.auth_user_id, { password: clave });
  if (error) return falla(errorDeLaCuenta(error.message));
  return responder({ ok: true });
}

async function quitarAcceso(servidor: Cliente, u: Ficha): Promise<Response> {
  if (!u.auth_user_id) return responder({ ok: true });
  // Primero se desvincula: si el borrado de la cuenta fallara, igual ya no entra como esta persona.
  const { error: e1 } = await servidor.from("usuario").update({ auth_user_id: null }).eq("id", u.id);
  if (e1) return falla(e1.message, 500);
  const { error } = await servidor.auth.admin.deleteUser(u.auth_user_id);
  if (error && !/not found/i.test(error.message)) return falla(`Se desvinculó, pero la cuenta no se borró: ${error.message}`, 500);
  return responder({ ok: true });
}

async function eliminar(servidor: Cliente, u: Ficha): Promise<Response> {
  // La baja va primero: si dejara al sistema sin administrador, la base la frena y la cuenta queda como estaba.
  const { error: e1 } = await servidor
    .from("usuario")
    .update({ eliminado_en: new Date().toISOString(), activo: false, auth_user_id: null })
    .eq("id", u.id);
  if (e1) {
    if (/sin nadie que pueda administrar/i.test(e1.message)) {
      return falla("Es la única persona que puede administrar permisos. Asigná primero a otra.");
    }
    return falla(e1.message, 500);
  }
  if (u.auth_user_id) {
    const { error } = await servidor.auth.admin.deleteUser(u.auth_user_id);
    if (error && !/not found/i.test(error.message)) return falla(`Se dio de baja, pero la cuenta no se borró: ${error.message}`, 500);
  }
  return responder({ ok: true });
}

async function sincronizarCorreo(servidor: Cliente, u: Ficha): Promise<Response> {
  if (!u.auth_user_id) return responder({ ok: true });
  const correo = (u.email ?? "").trim();
  if (!correo) return falla("Con acceso al sistema, el correo no puede quedar vacío: es con lo que entra.");
  if (!correoValido(correo)) return falla("Esa dirección de correo no es válida.");
  const { error } = await servidor.auth.admin.updateUserById(u.auth_user_id, { email: correo, email_confirm: true });
  if (error) return falla(errorDeLaCuenta(error.message));
  return responder({ ok: true });
}
