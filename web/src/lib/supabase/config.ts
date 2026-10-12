export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until the Supabase env vars are set; the app then runs on demo rooms only. */
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
