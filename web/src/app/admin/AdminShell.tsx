"use client";
import { createContext, useContext, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import styles from "./admin.module.css";

export type Overview = { reports: number; chats: number; listings: number; verifications: number; suspended: number; live_listings: number; open_bookings: number; people: number };

/** Sidebar counts, owned by the admin layout; pages refresh them after acting. */
export const AdminCounts = createContext<{ counts: Overview | null; refresh: () => void }>({ counts: null, refresh: () => {} });
export const useAdminCounts = () => useContext(AdminCounts);

/** A section's heading and body. The frame around it (sidebar, top bar) lives in admin/layout.tsx. */
export function AdminShell({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className={styles.head}>
        <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
        {actions}
      </div>
      {children}
    </>
  );
}

/** Placeholder rows while a section loads. */
export function Skeleton({ rows = 3, height = 120 }: { rows?: number; height?: number }) {
  return <div className={styles.list} aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className={styles.skel} style={{ height }} />)}</div>;
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return <div className={styles.empty}><span className={styles.emptyIcon}><Inbox size={22} /></span><b>{title}</b>{text && <span>{text}</span>}</div>;
}

/** Tab switch for a section's filters. */
export function Tabs<T extends string | boolean | null>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className={styles.tabs} role="tablist">
      {options.map(([v, label]) => (
        <button key={String(v)} role="tab" aria-selected={value === v} className={`${styles.tab} ${value === v ? styles.tabOn : ""}`} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
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
