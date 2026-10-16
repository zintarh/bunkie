"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, Plus, Search, X } from "lucide-react";
import { useMe } from "@/lib/auth";
import { useUnreadChats } from "@/lib/chat";
import { initial } from "@/lib/format";
import { avatarUrl } from "@/lib/photos";
import { usePrefs } from "@/lib/prefs";
import { BunkIcon, ChatIcon, HomeIcon } from "./icons";
import { BunkMark } from "./ui";

/**
 * Laptop layout, Instagram-for-web style (phones keep the phone layout; this is all hidden below 1024px):
 * a left sidebar for navigation, and the page in the middle.
 *  feed   Home: one column of rooms with a right-hand panel
 *  dm     Messages: conversations and the open chat side by side
 *  page   everything else: a centred column
 *  full   pages with their own frame (landing, admin)
 */
function modeFor(path: string): "feed" | "dm" | "page" | "full" {
  if (path === "/" || path.startsWith("/admin")) return "full";
  if (path === "/explore") return "feed";
  if (path.startsWith("/inbox")) return "dm";
  return "page";
}

function SideNav({ path, onSearch, searching }: { path: string; onSearch: () => void; searching: boolean }) {
  const [me] = useMe();
  const unread = useUnreadChats();
  const photo = avatarUrl(me?.profile.photo_path);
  const is = (p: string) => !searching && (path === p || path.startsWith(p + "/"));
  const item = (href: string, label: string, icon: ReactNode, extra?: ReactNode) => (
    <Link href={href} className={`sidenav-item${is(href) ? " on" : ""}`} aria-current={is(href) ? "page" : undefined}>
      <span className="sidenav-icon">{icon}{extra}</span><span className="sidenav-label">{label}</span>
    </Link>
  );
  return (
    <nav className={`sidenav${searching ? " narrow" : ""}`} aria-label="Main">
      <Link href="/explore" className="sidenav-brand" aria-label="Bunkie home">
        <i><BunkMark /></i><span className="sidenav-label">bunkie</span>
      </Link>
      <div className="sidenav-items">
        {item("/explore", "Home", <HomeIcon size={24} active={is("/explore")} />)}
        <button className={`sidenav-item${searching ? " on" : ""}`} onClick={onSearch} aria-expanded={searching}>
          <span className="sidenav-icon"><Search size={24} strokeWidth={searching ? 2.6 : 2} /></span><span className="sidenav-label">Search</span>
        </button>
        {me && item("/inbox", "Messages", <ChatIcon size={24} active={is("/inbox")} />,
          unread > 0 ? <span className="sidenav-badge">{unread > 9 ? "9+" : unread}</span> : null)}
        {item("/bookings", "Bookings", <BunkIcon size={24} active={is("/bookings")} />)}
        {item("/saved", "Saved", <Heart size={24} strokeWidth={is("/saved") ? 2.6 : 2} fill={is("/saved") ? "currentColor" : "none"} />)}
        {item("/host", "Host a corper", <span className="sidenav-create"><Plus size={17} strokeWidth={2.6} /></span>)}
      </div>
      <div className="sidenav-items sidenav-bottom">
        {me
          ? item("/profile", "Profile", <span className={`sidenav-avatar${is("/profile") ? " on" : ""}`}>{photo ? <img src={photo} alt="" /> : initial(me.profile.first_name)}</span>)
          : <Link href="/signup" className="sidenav-signup"><span className="sidenav-label">Sign up</span><span className="sidenav-signup-short">Join</span></Link>}
      </div>
    </nav>
  );
}

/** Instagram-style search panel that slides out from the sidebar. */
function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), []);
  const ideas = ["self con near Utako under 80k", "girls only shared room in Wuse 2", "2 weeks near Federal Secretariat", "own room with own bathroom in Jabi"];
  const go = (text: string) => {
    if (!text.trim()) return;
    onClose();
    router.push(`/explore?q=${encodeURIComponent(text.trim())}`);
  };
  return (
    <div className="searchpanel" role="dialog" aria-label="Search">
      <div className="between"><span className="searchpanel-title">Search</span><button className="ib" onClick={onClose} aria-label="Close search"><X size={20} /></button></div>
      <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="searchpanel-box">
        <Search size={17} />
        <label htmlFor="panel-q" className="sr-only">Search rooms</label>
        <input id="panel-q" ref={box} placeholder="Area, budget, room type…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="ib" style={{ width: 28, height: 28 }} onClick={() => setQ("")} aria-label="Clear"><X size={15} /></button>}
      </form>
      <div className="searchpanel-list">
        <span className="searchpanel-label">Try</span>
        {ideas.map((t) => <button key={t} className="searchpanel-idea" onClick={() => go(t)}><Search size={16} />{t}</button>)}
      </div>
    </div>
  );
}

/** Home's right-hand panel: who you are, your PPA, and a way into hosting. */
function HomeRail() {
  const [me] = useMe();
  const [prefs] = usePrefs();
  const photo = avatarUrl(me?.profile.photo_path);
  return (
    <aside className="homerail" aria-label="You">
      {me ? (
        <Link href="/profile" className="homerail-me">
          <span className="sidenav-avatar big">{photo ? <img src={photo} alt="" /> : initial(me.profile.first_name)}</span>
          <span className="stack" style={{ gap: 0, minWidth: 0 }}><b>{me.profile.first_name || "You"}</b><span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.user.email}</span></span>
        </Link>
      ) : (
        <div className="homerail-card"><b>Find your bunkie</b><span className="small">Sign up to message hosts and request rooms.</span><Link className="btn sm" href="/signup">Sign up</Link></div>
      )}
      <Link href={prefs.stage === "in_camp" ? "/start" : "/ppa"} className="homerail-card">
        <span className="small" style={{ fontWeight: 700 }}>{prefs.stage === "in_camp" ? "In camp" : "Your PPA"}</span>
        <b>{prefs.stage === "in_camp" ? "Rooms free on your camp exit day" : prefs.ppa?.label ?? "Add your PPA"}</b>
        <span className="link" style={{ height: "auto", alignSelf: "flex-start", padding: 0 }}>Change</span>
      </Link>
      <Link href="/host" className="homerail-host">
        <span className="sidenav-create big"><Plus size={20} strokeWidth={2.6} /></span>
        <span className="stack" style={{ gap: 0 }}><b>Host a corper</b><span className="small">List your room</span></span>
      </Link>
      <nav className="homerail-foot" aria-label="About">
        <Link href="/help">Help</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/waitlist">Other states</Link>
        <span>© Bunkie · Not affiliated with NYSC</span>
      </nav>
    </aside>
  );
}

export function DesktopFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const mode = modeFor(path);
  const [searching, setSearching] = useState(false);
  useEffect(() => setSearching(false), [path]);
  if (mode === "full") return <div className="app">{children}</div>;
  return (
    <>
      <SideNav path={path} searching={searching} onSearch={() => setSearching((v) => !v)} />
      {searching && <><div className="searchpanel-scrim" onClick={() => setSearching(false)} /><SearchPanel onClose={() => setSearching(false)} /></>}
      <div className={`desk-main desk-${mode}`}>
        <div className="app">{children}</div>
        {mode === "feed" && <HomeRail />}
      </div>
    </>
  );
}
