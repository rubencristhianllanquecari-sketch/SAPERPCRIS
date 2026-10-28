import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://rubencristhianllanquecari-sketch.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ownerEmail = "comercialllanque@gmail.com";
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Método no permitido." });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return reply(500, { error: "Falta configurar Supabase en el servidor." });
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { error: "Inicia sesión nuevamente." });
    const authClient = createClient(url, anonKey);
    const authResult = await authClient.auth.getUser(token);
    const actor = authResult.data.user;
    if (authResult.error || !actor) return reply(401, { error: "Sesión inválida. Vuelve a iniciar sesión." });
    if ((actor.email || "").toLowerCase() !== ownerEmail) return reply(403, { error: "Solo la cuenta administradora puede gestionar usuarios." });
    const body = await request.json();
    const admin = createClient(url, serviceKey);
    if (body.action === "list") {
      const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (result.error) return reply(400, { error: result.error.message });
      const users = result.data.users.map((user) => ({ id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at }));
      return reply(200, { users });
    }
    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!/^\S+@\S+\.\S+$/.test(email)) return reply(400, { error: "Escribe un correo válido." });
      if (password.length < 8) return reply(400, { error: "La contraseña debe tener al menos 8 caracteres." });
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error) return reply(400, { error: result.error.message });
      return reply(200, { user: { id: result.data.user.id, email: result.data.user.email } });
    }
    if (body.action === "update") {
      const id = String(body.userId || "");
      if (!id || id === actor.id) return reply(400, { error: "No puedes editar la cuenta administradora desde esta pantalla." });
      const attributes: Record<string, unknown> = {};
      if (body.email !== undefined) {
        const email = String(body.email || "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return reply(400, { error: "Escribe un correo válido." });
        attributes.email = email;
        attributes.email_confirm = true;
      }
      if (body.password) {
        const password = String(body.password);
        if (password.length < 8) return reply(400, { error: "La contraseña debe tener al menos 8 caracteres." });
        attributes.password = password;
      }
      if (Object.keys(attributes).length === 0) return reply(400, { error: "No hay cambios para guardar." });
      const result = await admin.auth.admin.updateUserById(id, attributes);
      if (result.error) return reply(400, { error: result.error.message });
      return reply(200, { user: { id: result.data.user.id, email: result.data.user.email } });
    }
    if (body.action === "delete") {
      const id = String(body.userId || "");
      if (!id || id === actor.id) return reply(400, { error: "No puedes borrar la cuenta administradora." });
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) return reply(400, { error: result.error.message });
      return reply(200, { deleted: true });
    }
    return reply(400, { error: "Acción no reconocida." });
  } catch (error) {
    return reply(500, { error: error instanceof Error ? error.message : "Error interno." });
  }
});
