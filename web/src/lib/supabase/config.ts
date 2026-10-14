export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until the Supabase env vars are set; the app then runs on demo rooms only. */
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Show "Continue with Google" only once the Google provider is enabled in Supabase Auth. */
export const hasGoogle = hasSupabase && process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true";
