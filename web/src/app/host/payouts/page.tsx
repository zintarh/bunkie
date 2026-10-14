"use client";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { dayLabel, naira } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

type Row = { id: string; amount_kobo: number; status: string; release_after: string; created_at: string };
const LABEL: Record<string, [string, string]> = {
  scheduled: ["Held until move-in", "amber"], processing: ["On its way", "green"], done: ["Paid", "green"], failed: ["Failed · we're on it", "red"], cancelled: ["Refunded to bunkie", "grey"],
};

function Payouts() {
  const [me] = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (me) supabaseBrowser()?.from("payouts").select("id, amount_kobo, status, release_after, created_at").order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [me]);
  return (
    <main className="screen">
      <TopBar back="/host" title="Payouts" />
      <div className="body" style={{ gap: 0 }}>
        {rows?.length === 0 && <p className="sub">No payouts yet. They appear when a bunkie moves in.</p>}
        {rows?.map((r) => (
          <div key={r.id} className="lrow" style={{ justifyContent: "space-between" }}>
            <span className="stack" style={{ gap: 2 }}>
              <b className="num">{naira(r.amount_kobo / 100)}</b>
              <span className="small">{r.status === "scheduled" ? `From ${dayLabel(new Date(r.release_after))}` : dayLabel(new Date(r.created_at))}</span>
            </span>
            <span className={`badge ${LABEL[r.status]?.[1] ?? "grey"}`}>{LABEL[r.status]?.[0] ?? r.status}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function Page() {
  return <RequireAuth><Payouts /></RequireAuth>;
}
