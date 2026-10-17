// Sends due phone notifications right away. The app calls it after someone does something that
// alerts the other person (a message, a request, an offer), so they don't wait for the 5-minute cron.
// Any signed-in user may call it, from any origin: it only sends what's already due.
import { requireUser } from "../_shared/clients.ts";
import { drainPush } from "../_shared/push.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await requireUser(req);
  } catch {
    return new Response(JSON.stringify({ error: "Sign in first." }), { status: 401, headers: cors });
  }
  const sent = await drainPush(25, 15000);
  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
