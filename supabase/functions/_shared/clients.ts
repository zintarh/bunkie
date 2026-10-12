import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Service-role client. Bypasses RLS: use only for sys_* calls and storage reads. */
export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

/** Client acting as the caller, from their Authorization header. */
export function asUser(req: Request): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export async function requireUser(req: Request) {
  const db = asUser(req);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Log in first.");
  return { db, user: data.user };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Wraps a handler with CORS and turns thrown HttpErrors into JSON responses. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong. Try again." }, 500);
    }
  });
}
