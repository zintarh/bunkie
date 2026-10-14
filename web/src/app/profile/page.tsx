"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, ChevronRight, CircleHelp, FileText, Home, KeyRound, Lock, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { Loading, TabBar } from "@/components/ui";
import { refreshMe, useMe } from "@/lib/auth";
import { initial } from "@/lib/format";
import { avatarUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Profile() {
  const router = useRouter();
  const [me, loading] = useMe();

  const rows: { href: string; label: string; Icon: typeof Home; tile: string; show: boolean }[] = [
    { href: "/host", label: me?.profile.is_host ? "Hosting" : "Host a room", Icon: Home, tile: "t-mint", show: true },
    { href: "/verify", label: "Verify you", Icon: ShieldCheck, tile: "t-amber", show: !!me && !me.profile.is_verified },
    { href: "/questions?next=/profile", label: "Bunkie questions", Icon: Sparkles, tile: "t-lilac", show: !!me },
    { href: "/host/corper?next=/profile", label: me?.profile.corper_verified ? "Corp member · verified" : "Corp member status", Icon: Award, tile: "t-amber", show: !!me?.profile.corper_status },
    { href: "/help", label: "Get help", Icon: CircleHelp, tile: "t-sky", show: true },
    { href: "/privacy", label: "Privacy, in plain words", Icon: Lock, tile: "t-coral", show: true },
    { href: "/terms", label: "Terms", Icon: FileText, tile: "t-mint", show: true },
    { href: "/account/password", label: "Change password", Icon: KeyRound, tile: "t-amber", show: !!me },
  ];

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
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>
              {avatarUrl(me.profile.photo_path) ? <img src={avatarUrl(me.profile.photo_path)!} alt="" /> : initial(me.profile.first_name)}
            </span>
            <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span className="row" style={{ gap: 6, fontWeight: 700, fontSize: 17 }}>
                {me.profile.first_name || "You"}{me.profile.is_verified && <BadgeCheck size={18} color="var(--green)" aria-label="Verified" />}
              </span>
              <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.user.email}</span>
            </span>
          </div>
        )}

        <div className="lrows">
          {rows.filter((r) => r.show).map(({ href, label, Icon, tile }) => (
            <Link key={href} className="lrow" href={href}>
              <span className={`tile ${tile}`}><Icon size={20} strokeWidth={2.2} /></span>
              <span style={{ flex: 1 }}>{label}</span>
              <ChevronRight size={18} color="var(--muted)" />
            </Link>
          ))}
          {me && (
            <button className="lrow" onClick={async () => {
              await supabaseBrowser()?.auth.signOut();
              await refreshMe();
              router.replace("/explore");
            }}>
              <span className="tile" style={{ background: "#F1F4F2" }}><LogOut size={20} strokeWidth={2.2} /></span>
              <span style={{ flex: 1 }}>Log out</span>
            </button>
          )}
        </div>

        <p className="small" style={{ marginTop: "auto", paddingTop: 24, fontSize: 12, lineHeight: 1.6, textAlign: "center" }}>
          [Company name] · RC [CAC number]<br />[support email] · [support phone]<br />Not affiliated with or endorsed by NYSC.
        </p>
      </div>
      <TabBar />
    </main>
  );
}
