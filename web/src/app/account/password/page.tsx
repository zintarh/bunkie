"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordField, RequireAuth } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

function NewPassword() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    const { error } = (await supabaseBrowser()?.auth.updateUser({ password: pw })) ?? {};
    setBusy(false);
    if (error) return setError(errorText(error));
    router.replace("/profile");
  };
  return (
    <main className="screen">
      <TopBar back="/profile" />
      <div className="body">
        <h1 className="h1">New password</h1>
        <div className="stack">
          <label className="lbl" htmlFor="pw">Password</label>
          <PasswordField id="pw" value={pw} onChange={setPw} autoComplete="new-password" />
          <span className="small">At least 8 characters</span>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot"><button className="btn" disabled={pw.length < 8 || busy} onClick={save}>Save password</button></div>
    </main>
  );
}

export default function Page() {
  return <RequireAuth next="/account/password"><NewPassword /></RequireAuth>;
}
