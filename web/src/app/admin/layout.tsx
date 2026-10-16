"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BadgeCheck, Flag, LayoutGrid, ListChecks, MessageSquareWarning, ScrollText, Search, Users } from "lucide-react";
import { BunkMark } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { initial } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminCounts, type Overview } from "./AdminShell";
import styles from "./admin.module.css";

const REVIEW = [
  { href: "/admin/reports", label: "Reports", Icon: Flag, count: "reports", urgent: true },
  { href: "/admin/chats", label: "Flagged chats", Icon: MessageSquareWarning, count: "chats", urgent: true },
  { href: "/admin/listings", label: "Listings", Icon: ListChecks, count: "listings", urgent: false },
  { href: "/admin/verifications", label: "ID checks", Icon: BadgeCheck, count: null, urgent: false },
] as const;
const MANAGE = [
  { href: "/admin/people", label: "People", Icon: Users },
  { href: "/admin/log", label: "Activity log", Icon: ScrollText },
] as const;
const TITLES: Record<string, string> = {
  "/admin": "Overview", "/admin/reports": "Reports", "/admin/chats": "Flagged chats", "/admin/listings": "Listings",
  "/admin/verifications": "ID checks", "/admin/people": "People", "/admin/log": "Activity log",
};

// Checked once per visit, so moving between sections never re-checks or redraws the frame.
let knownAdmin: boolean | null = null;

/**
 * The admin frame: sidebar and top bar are drawn once and stay while sections change underneath.
 * Until the admin check answers, the frame shows with an empty content area (no app screens in between).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, loading] = useMe();
  const [ok, setOk] = useState<boolean | null>(knownAdmin);
  const [counts, setCounts] = useState<Overview | null>(null);
  const [find, setFind] = useState("");

  useEffect(() => {
    const db = supabaseBrowser();
    if (loading) return;
    if (!me || !db) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    if (knownAdmin === null) {
      db.rpc("am_admin").then(({ data }) => {
        knownAdmin = !!data;
        setOk(knownAdmin);
      });
    }
  }, [me, loading, path, router]);

  const refresh = () => supabaseBrowser()?.rpc("admin_overview").then(({ data }) => setCounts(data as Overview));
  useEffect(() => {
    if (ok) void refresh();
  }, [ok, path]);

  if (ok === false) {
    return (
      <div className={styles.frame} data-full style={{ gridTemplateColumns: "1fr", placeItems: "center" }}>
        <div className={styles.empty} style={{ maxWidth: 360 }}><b>Not found</b><Link className={styles.btn} href="/explore">Go to Bunkie</Link></div>
      </div>
    );
  }

  const section = Object.keys(TITLES).filter((k) => path === k || (k !== "/admin" && path.startsWith(k))).pop() ?? "/admin";
  const NavLink = ({ href, label, Icon, n, urgent }: { href: string; label: string; Icon: typeof Flag; n?: number; urgent?: boolean }) => {
    const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
    return (
      <Link href={href} className={`${styles.link} ${on ? styles.on : ""}`} aria-current={on ? "page" : undefined}>
        <Icon size={18} />{label}
        {n ? <span className={`${styles.count} ${urgent ? styles.urgent : ""}`}>{n}</span> : null}
      </Link>
    );
  };

  return (
    <div className={styles.frame} data-full>
      <nav className={styles.side} aria-label="Admin">
        <Link href="/admin" className={styles.brand}>
          <i><BunkMark /></i>
          <span><b>bunkie</b><small>Team</small></span>
        </Link>
        <div className={styles.group}>
          <NavLink href="/admin" label="Overview" Icon={LayoutGrid} />
        </div>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Review</span>
          {REVIEW.map((r) => <NavLink key={r.href} href={r.href} label={r.label} Icon={r.Icon} n={r.count && counts ? counts[r.count] : 0} urgent={r.urgent} />)}
        </div>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Manage</span>
          {MANAGE.map((m) => <NavLink key={m.href} href={m.href} label={m.label} Icon={m.Icon} />)}
        </div>
        <div className={styles.sideFoot}>
          <NavLink href="/explore" label="Back to the app" Icon={ArrowLeft} />
        </div>
      </nav>

      <div className={styles.main}>
        <header className={styles.top}>
          <span className={styles.crumb}>Team · <b>{TITLES[section]}</b></span>
          <form className={styles.find} role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/admin/people?q=${encodeURIComponent(find.trim())}`); }}>
            <Search size={16} />
            <label htmlFor="admin-find" className="sr-only">Find a person</label>
            <input id="admin-find" placeholder="Find a person by name, email or phone" value={find} onChange={(e) => setFind(e.target.value)} />
          </form>
          <span className={styles.me} title={me?.user.email ?? ""}>{initial(me?.profile.first_name || me?.user.email)}</span>
        </header>
        <main className={styles.content}>
          {ok ? <AdminCounts.Provider value={{ counts, refresh: () => void refresh() }}>{children}</AdminCounts.Provider> : null}
        </main>
      </div>
    </div>
  );
}
