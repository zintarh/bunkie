"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Minus, Plus, X } from "lucide-react";
import { BunkIcon, HomeIcon, KeyIcon, ProfileIcon } from "./icons";

/** The bunk-bed mark used in the logo. */
export function BunkMark({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
      <path d="M5 4v16M19 4v16M5 10h14M5 16h14" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <i><BunkMark /></i>bunkie
    </span>
  );
}

/** Back (or close) button that goes to `href`, or back in history when none is given. */
export function BackButton({ href, close = false, label }: { href?: string; close?: boolean; label?: string }) {
  const router = useRouter();
  const icon = close ? <X size={22} strokeWidth={2.4} /> : <ChevronLeft size={24} strokeWidth={2.2} />;
  const aria = label ?? (close ? "Close" : "Back");
  if (href) return <Link className="ib" href={href} aria-label={aria}>{icon}</Link>;
  return <button className="ib" onClick={() => router.back()} aria-label={aria}>{icon}</button>;
}

export function TopBar({ back, close, title, right }: { back?: string | true; close?: boolean; title?: string; right?: ReactNode }) {
  return (
    <div className="topbar">
      {back !== undefined && <BackButton href={back === true ? undefined : back} close={close} />}
      {title && <span className="title">{title}</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// Messages is an icon on Home (shows unread replies); Saved is in Profile; hosting gets its own tab.
const TABS = [
  { href: "/explore", label: "Home", Icon: HomeIcon, also: ["/rooms", "/inbox"] },
  { href: "/bookings", label: "Bookings", Icon: BunkIcon, also: [] },
  { href: "/host", label: "Host", Icon: KeyIcon, also: [] },
  { href: "/profile", label: "Profile", Icon: ProfileIcon, also: ["/saved"] },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map(({ href, label, Icon, also }) => {
        const on = [href, ...also].some((h) => path === h || path.startsWith(h + "/"));
        return (
          <Link key={href} href={href} className={on ? "tab on" : "tab"} aria-current={on ? "page" : undefined}>
            <Icon size={24} active={on} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Seg<T extends string | number>({
  options, value, onChange, label,
}: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({
  options, value, onChange, label, scroll = false,
}: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string; scroll?: boolean }) {
  return (
    <div className={scroll ? "chips scroll" : "chips"} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? "chip on" : "chip"} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "sw on" : "sw"} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Stepper({ value, min, max, onChange, format, label }: {
  value: number; min: number; max: number; onChange: (v: number) => void; format: (v: number) => string; label: string;
}) {
  return (
    <div className="row" style={{ gap: 14 }}>
      <button type="button" className="step" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        <Minus size={18} strokeWidth={2.4} />
      </button>
      <span className="num" style={{ minWidth: 92, textAlign: "center", fontWeight: 700, fontSize: 16 }} aria-live="polite">{format(value)}</span>
      <button type="button" className="step" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
        <Plus size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const show = useCallback((m: string) => setMsg(m), []);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, show];
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        {children}
      </div>
    </div>
  );
}

/** Progress bar used by multi-step flows. */
/** Full-screen spinner shown until a screen knows what to show, so nothing flashes and then changes. */
export function Loading({ tabs }: { tabs?: boolean }) {
  return (
    <main className="screen">
      <div className="body" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></div>
      {tabs && <TabBar />}
    </main>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}
