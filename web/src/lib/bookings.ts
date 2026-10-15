"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import type { Answers, Booking, BookingStatus } from "./types";

export type Person = { id: string; first_name: string; photo_path: string | null; is_verified: boolean };
export type Agreement = { id: string; version: number; terms: Terms; terms_hash: string; host_confirmed_at: string | null; tenant_confirmed_at: string | null };
export type Terms = {
  move_in: string; move_out: string; months: number | null; weeks: number | null; weekly_price: number | null; monthly_total: number; rent_monthly: number; deposit: number;
  pay_schedule: "monthly" | "lump_sum"; total_varies: boolean;
  costs: { name: string; amount: number; tenant_pays: boolean; varies: boolean }[];
  rules: { topic: string; choice: string; consequence: string }[];
  refunds: { early_leave_notice_days: number; redeploy_refund: string; ask_leave_notice_days: number; short_stay_no_refund_last_days?: number };
  platform: { min_notice_days: number };
};
export type Payment = { id: string; amount_kobo: number; paystack_fee_kobo: number; bunkie_fee_kobo: number; paystack_reference: string; status: string; paid_at: string | null };

export type BookingFull = Booking & {
  message: string | null;
  arrival_window: string | null;
  listing: { id: string; area_name: string; room_kind: string; cover_path: string | null; deposit: number | null; pay_schedule: "monthly" | "lump_sum" };
  tenant: Person;
  host: Person;
  tenantAnswers: Answers | null;
  agreement: Agreement | null;
  payments: Payment[];
  refunds: { amount_kobo: number; status: string; reason: string }[];
};

export const OPEN: BookingStatus[] = ["requested", "accepted", "viewing_booked", "viewed", "host_confirmed", "agreed"];
export const LIVE: BookingStatus[] = ["paid", "moved_in", "active", "ending"];

const SELECT = `*, listing:listings(id, area_name, room_kind, cover_path, deposit, pay_schedule),
  tenant:profiles!bookings_tenant_id_fkey(id, first_name, photo_path, is_verified),
  host:profiles!bookings_host_id_fkey(id, first_name, photo_path, is_verified)`;

export async function fetchBooking(id: string): Promise<BookingFull | null> {
  const db = supabaseBrowser();
  if (!db) return null;
  const { data: b } = await db.from("bookings").select(SELECT).eq("id", id).maybeSingle();
  if (!b) return null;
  const [ans, agr, pay, ref] = await Promise.all([
    db.from("bunkie_answers").select("sleep, guests, cooking, cleaning, noise").eq("user_id", b.tenant_id).maybeSingle(),
    db.from("agreement_versions").select("*").eq("booking_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("payments").select("id, amount_kobo, paystack_fee_kobo, bunkie_fee_kobo, paystack_reference, status, paid_at").eq("booking_id", id).order("created_at"),
    db.from("refunds").select("amount_kobo, status, reason").eq("booking_id", id),
  ]);
  return { ...b, tenantAnswers: (ans.data as Answers) ?? null, agreement: agr.data ?? null, payments: pay.data ?? [], refunds: ref.data ?? [] } as BookingFull;
}

export async function fetchMyBookings(role: "tenant" | "host") {
  const db = supabaseBrowser();
  if (!db) return [];
  const { data: u } = await db.auth.getUser();
  if (!u.user) return [];
  const { data } = await db.from("bookings").select(SELECT).eq(role === "tenant" ? "tenant_id" : "host_id", u.user.id)
    .order("updated_at", { ascending: false }).limit(100);
  return (data ?? []) as BookingFull[];
}

/** Loads a booking and keeps it fresh: refetches on focus and when the booking changes. */
export function useBooking(id: string): [BookingFull | null | undefined, () => Promise<void>] {
  const [b, setB] = useState<BookingFull | null | undefined>(undefined);
  const reload = useCallback(async () => setB(await fetchBooking(id)), [id]);
  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    // Live updates while the screen is open; WhatsApp covers the rest.
    const db = supabaseBrowser();
    const ch = db?.channel(`booking:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, () => void reload())
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      if (ch) void db?.removeChannel(ch);
    };
  }, [id, reload]);
  return [b, reload];
}

export async function act(b: { id: string; version: number }, action: string, payload: Record<string, unknown> = {}) {
  const db = supabaseBrowser();
  if (!db) throw new Error("Connect Supabase first.");
  const { error } = await db.rpc("booking_action", { p_booking: b.id, p_action: action, p_version: b.version, p_payload: payload });
  if (error) throw error;
}

export function roomTitle(b: BookingFull) {
  return `${b.listing.room_kind === "own_room" ? "Own room" : "Shared room"} · ${b.listing.area_name}`;
}
