import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { qs } from "@/lib/url";

// Google sign-in and password-reset links land here with a one-time code.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const raw = url.searchParams.get("next") ?? "/explore";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/explore";

  const db = await supabaseServer();
  if (code && db) {
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // First Google sign-in: ask for the name on the NIN before going on.
      const { data: profile } = await db.from("profiles").select("first_name").eq("id", data.user.id).single();
      if (!profile?.first_name && next !== "/account/password") {
        return NextResponse.redirect(new URL(`/signup/name?next=${qs(next)}`, url.origin));
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
