// Edge Function "gemini": usa a chave guardada no banco (só o admin define) para chamar o Gemini.
// A chave NUNCA vai para o navegador. Só usuários logados podem chamar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TEXT_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];
const IMAGE_MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: uerr } = await admin.auth.getUser(token);
    if (uerr || !user) return json({ error: "Faça login para usar a IA." }, 401);

    const raw = await req.text();
    if (raw.length > 400_000) return json({ error: "Pedido grande demais." }, 413);
    const { kind, payload } = JSON.parse(raw);
    if (!payload || (kind !== "text" && kind !== "image")) return json({ error: "Pedido inválido." }, 400);

    const { data: rows } = await admin.from("app_secrets").select("key,value")
      .in("key", ["gemini_api_key", "gemini_text_model", "gemini_image_model"]);
    const m = Object.fromEntries((rows || []).map((r: { key: string; value: string }) => [r.key, r.value]));
    if (!m.gemini_api_key) return json({ error: "A IA ainda não foi ativada: o administrador precisa salvar a chave do Gemini no Painel Admin." }, 503);

    // Modelo escolhido pelo admin (se houver) vem primeiro; depois a lista de reserva.
    // Se o Google tirar um modelo do ar (404 / "não está mais disponível"), tenta o próximo.
    const preferred = kind === "image" ? m.gemini_image_model : m.gemini_text_model;
    const defaults = kind === "image" ? IMAGE_MODELS : TEXT_MODELS;
    const list = [...new Set([preferred, ...defaults].filter(Boolean))] as string[];

    let last = { status: 500, text: JSON.stringify({ error: "Nenhum modelo respondeu." }) };
    for (const model of list) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": m.gemini_api_key },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      if (r.ok) return new Response(text, { status: 200, headers: { ...cors, "Content-Type": "application/json", "X-Gemini-Model": model } });
      last = { status: r.status, text };
      const modelGone = r.status === 404 || /no longer available|not found|is not supported|deprecated/i.test(text);
      if (!modelGone) break; // erro real (chave inválida, cota, conteúdo bloqueado): outro modelo não resolve
    }
    return new Response(last.text, { status: last.status, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
