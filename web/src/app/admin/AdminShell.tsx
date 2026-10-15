"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, Flag, Home, ListChecks, MessageSquareWarning, ScrollText, Users } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { BunkMark, Loading } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import styles from "./admin.module.css";

export type Overview = { reports: number; chats: number; listings: number; verifications: number; suspended: number; live_listings: number; open_bookings: number; people: number };

const NAV = [
  { href: "/admin", label: "Overview", Icon: Home, count: null },
  { href: "/admin/reports", label: "Reports", Icon: Flag, count: "reports" },
  { href: "/admin/chats", label: "Flagged chats", Icon: MessageSquareWarning, count: "chats" },
  { href: "/admin/listings", label: "Listings in review", Icon: ListChecks, count: "listings" },
  { href: "/admin/verifications", label: "ID checks", Icon: BadgeCheck, count: null },
  { href: "/admin/people", label: "People", Icon: Users, count: null },
  { href: "/admin/log", label: "Activity log", Icon: ScrollText, count: null },
] as const;

/** Admin frame: checks the person is on the team, then shows the sidebar and the section. */
function Shell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const [ok, setOk] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Overview | null>(null);
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db) return setOk(false);
    db.rpc("am_admin").then(({ data }) => {
      setOk(!!data);
      if (data) db.rpc("admin_overview").then(({ data: o }) => setCounts(o as Overview));
    });
  }, [path]);

  if (ok === null) return <Loading />;
  if (!ok) {
    return <main className="screen" style={{ alignItems: "center", justifyContent: "center", gap: 12 }}><span className="h2">Not found</span><Link className="btn" href="/explore">Go home</Link></main>;
  }
  return (
    <div className={styles.shell} data-full>
      <nav className={styles.side} aria-label="Admin">
        <Link href="/admin" className={styles.brand}><i><BunkMark /></i>bunkie <small>Admin</small></Link>
        {NAV.map(({ href, label, Icon, count }) => {
          const n = count && counts ? counts[count] : 0;
          const on = path === href || (href !== "/admin" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={`${styles.link} ${on ? styles.on : ""}`}>
              <Icon size={18} />{label}{n ? <span className={styles.count}>{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      <main className={styles.main}>
        <div className={styles.head}><h1>{title}</h1>{actions}</div>
        {children}
      </main>
    </div>
  );
}

export function AdminShell(props: { title: string; actions?: ReactNode; children: ReactNode }) {
  return <RequireAuth><Shell {...props} /></RequireAuth>;
}

/** Calls an admin RPC and reports the database's sentence on failure. */
export async function adminCall(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const db = supabaseBrowser();
  if (!db) return "Not connected";
  const { error } = await db.rpc(fn, args);
  return error ? error.message : null;
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
