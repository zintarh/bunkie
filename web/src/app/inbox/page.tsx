"use client";
import { MessageCircle } from "lucide-react";
import { InboxList } from "@/components/InboxList";
import { RequireAuth } from "@/components/auth";

export default function Page() {
  return (
    <RequireAuth next="/inbox">
      <div className="mob-only" style={{ display: "contents" }}><InboxList /></div>
      {/* Laptop: the list is already on the left; this pane waits for a chat. */}
      <main className="screen desk-only" style={{ alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
        <span className="tile t-mint" style={{ width: 72, height: 72, borderRadius: 999 }}><MessageCircle size={34} /></span>
        <span className="h2">Your messages</span>
        <span className="small" style={{ fontSize: 15 }}>Pick a chat, or message a host from any room.</span>
      </main>
    </RequireAuth>
  );
}
