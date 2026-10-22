"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Award, BadgeCheck, ChevronRight, CircleHelp, FileText, Heart, Home, KeyRound, Lock, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { AvatarPicker } from "@/components/AvatarPicker";
import { HostIcon } from "@/components/icons";
import { NotificationsRow } from "@/components/InstallPrompt";
import { Loading, TabBar } from "@/components/ui";
import { refreshMe, useMe } from "@/lib/auth";
import { forgetPush } from "@/lib/install";
import { SUPPORT_EMAIL } from "@/lib/site";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Profile() {
  const router = useRouter();
  const [me, loading] = useMe();
  // Every check sent and at least one still being looked at: say so instead of asking again.
  const [checking, setChecking] = useState<boolean | null>(null);
  useEffect(() => {
    if (!me || me.profile.is_verified) return;
    supabaseBrowser()?.rpc("my_verification").then(({ data }) => {
      const rows = (data ?? []) as { kind: string; status: string }[];
      const needed = me.profile.is_host ? ["phone", "nin", "liveness", "proof_of_address"] : ["phone", "nin", "liveness", "call_up"];
      const state = (k: string) => rows.find((r) => r.kind === k)?.status;
      setChecking(needed.every((k) => state(k) === "passed" || state(k) === "pending") && needed.some((k) => state(k) === "pending"));
    });
  }, [me]);

  type Row = { href: string; label: string; Icon: typeof Home; tile: string; show: boolean };
  // Grouped by what people come here for: who they are first, then account, then help.
  const profileRows: Row[] = [
    { href: "/questions?next=/profile", label: "Bunkie questions", Icon: Sparkles, tile: "t-lilac", show: !!me },
    { href: "/host/corper?next=/profile", label: me?.profile.corper_verified ? "Corp member · verified" : "Corp member status", Icon: Award, tile: "t-amber", show: !!me?.profile.corper_status },
    { href: "/saved", label: "Saved bunkies", Icon: Heart, tile: "t-coral", show: true },
  ];
  const helpRows: Row[] = [
    { href: "/help", label: "Get help", Icon: CircleHelp, tile: "t-sky", show: true },
    { href: "/privacy", label: "Privacy, in plain words", Icon: Lock, tile: "t-coral", show: true },
    { href: "/terms", label: "Terms", Icon: FileText, tile: "t-mint", show: true },
  ];
  const row = ({ href, label, Icon, tile }: Row) => (
    <Link key={href} className="lrow" href={href}>
      <span className={`tile ${tile}`}><Icon size={20} strokeWidth={2.2} /></span>
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
  const section = (title: string) => <h2 className="lbl" style={{ padding: "14px 4px 0", margin: 0 }}>{title}</h2>;

  if (loading) return <Loading tabs />;

  return (
    <main className="screen">
      <div className="body" style={{ gap: 12 }}>
        <div className="hero phero" style={{ margin: "-4px -20px 0" }}><h1 className="h1">Profile</h1></div>

        {!loading && !me && (
          <div className="card stack" style={{ gap: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>Sign up to request and book</span>
            <Link className="btn" href="/signup?next=/profile">Sign up</Link>
            <Link className="link" href="/login?next=/profile">I have an account</Link>
          </div>
        )}
        {me && (
          <div className="card row" style={{ gap: 14 }}>
            <AvatarPicker userId={me.user.id} name={me.profile.first_name} path={me.profile.photo_path} />
            <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span className="row" style={{ gap: 6, fontWeight: 700, fontSize: 17 }}>
                {me.profile.first_name || "You"}{me.profile.is_verified && <BadgeCheck size={18} color="var(--green)" aria-label="Verified" />}
              </span>
              <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.user.email}</span>
              {!me.profile.photo_path && <span className="small" style={{ color: "var(--green-text)" }}>Add a photo. Khaki looks good on you.</span>}
            </span>
          </div>
        )}

        {/* Verifying comes first: requesting a room needs it. */}
        {me && !me.profile.is_verified && checking && (
          <div className="lrows" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--green-soft)", boxShadow: "none", color: "var(--ink)" }}>
            <span className="tile t-mint"><ShieldCheck size={20} strokeWidth={2.2} /></span>
            <span className="stack" style={{ gap: 2, flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Checking your details</span>
              <span className="small">Your verified badge shows here once it&apos;s done.</span>
            </span>
          </div>
        )}
        {me && !me.profile.is_verified && checking === false && (
          <Link href="/verify" className="lrows" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--amber-soft)", boxShadow: "none", color: "var(--ink)" }}>
            <span className="tile" style={{ background: "var(--amber)", color: "var(--ink)" }}><ShieldCheck size={20} strokeWidth={2.2} /></span>
            <span className="stack" style={{ gap: 2, flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Verify you</span>
              <span className="small" style={{ color: "var(--amber-text)" }}>Needed to request a room.</span>
            </span>
            <ChevronRight size={18} />
          </Link>
        )}

        {/* Hosting sits here, like "Become a driver" in Bolt's menu. New hosts read the partner page first. */}
        <Link href={me?.profile.is_host ? "/host" : "/partners"} className="hostcard">
          <span className="tile" style={{ background: "rgba(255,255,255,.18)", color: "#fff", width: 48, height: 48, borderRadius: 14 }}><HostIcon size={26} /></span>
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 18 }}>{me?.profile.is_host ? "Hosting" : "Become a host partner"}</span>
            <span style={{ fontSize: 14, opacity: 0.9 }}>{me?.profile.is_host ? "Your rooms, requests and payouts" : "Be someone’s bunkie"}</span>
          </span>
          <ChevronRight size={20} />
        </Link>

        {section("Your profile")}
        <div className="lrows">{profileRows.filter((r) => r.show).map(row)}</div>

        {me && (
          <>
            {section("Account")}
            <div className="lrows">
              <NotificationsRow />
              {row({ href: "/account/password", label: "Change password", Icon: KeyRound, tile: "t-amber", show: true })}
              <button className="lrow" onClick={async () => {
                await forgetPush().catch(() => undefined);
                await supabaseBrowser()?.auth.signOut();
                await refreshMe();
                router.replace("/explore");
              }}>
                <span className="tile" style={{ background: "#F1F4F2" }}><LogOut size={20} strokeWidth={2.2} /></span>
                <span style={{ flex: 1 }}>Log out</span>
              </button>
            </div>
          </>
        )}

        {section("Help and legal")}
        <div className="lrows">{helpRows.map(row)}</div>

        <p className="small" style={{ marginTop: "auto", paddingTop: 24, fontSize: 12, lineHeight: 1.6, textAlign: "center" }}>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><br />Not affiliated with or endorsed by NYSC.
        </p>
      </div>
      <TabBar />
    </main>
  );
}
