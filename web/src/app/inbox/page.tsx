"use client";
import Link from "next/link";
import { BadgeCheck, MessageCircle } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { Loading, TabBar } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { useInbox } from "@/lib/chat";
import { chatTime, initial } from "@/lib/format";
import { avatarUrl } from "@/lib/photos";

function Inbox() {
  const [me] = useMe();
  const { rows, more, loadMore } = useInbox();
  if (!rows) return <Loading tabs />;
  return (
    <main className="screen">
      <div className="body" style={{ gap: 0, padding: "0 16px 24px" }}>
        <div className="hero phero" style={{ margin: "0 -16px 8px" }}><h1 className="h1">Messages</h1></div>
        {rows.length === 0 ? (
          <div className="card stack" style={{ alignItems: "center", textAlign: "center", padding: "32px 20px", gap: 10, marginTop: 12 }}>
            <span className="tile t-mint" style={{ width: 56, height: 56, borderRadius: 999 }}><MessageCircle size={26} /></span>
            <span className="h2">No messages yet</span>
            <span className="small" style={{ fontSize: 15 }}>Message a host from any room.</span>
            <Link className="btn" href="/explore" style={{ marginTop: 8 }}>Find a room</Link>
          </div>
        ) : (
          <div className="stack" style={{ gap: 0 }}>
            {rows.map((c) => {
              const mine = c.last_sender_id === me?.user.id;
              const unread = c.unread > 0 && !mine;
              const photo = avatarUrl(c.other_photo);
              return (
                <Link key={c.id} href={`/inbox/${c.id}`} className="row" style={{ gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>
                  <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>
                    {photo ? <img src={photo} alt="" /> : initial(c.other_name)}
                  </span>
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="between" style={{ gap: 8 }}>
                      <span className="row" style={{ gap: 4, fontWeight: unread ? 800 : 700, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.other_name}</span>
                        {c.other_verified && <BadgeCheck size={16} color="var(--green)" aria-label="Verified" style={{ flexShrink: 0 }} />}
                      </span>
                      <span className="small" style={{ flexShrink: 0, color: unread ? "var(--green-text)" : undefined, fontWeight: unread ? 700 : 500 }}>{chatTime(c.last_message_at)}</span>
                    </span>
                    {c.area_name && <span className="small" style={{ fontSize: 13 }}>{c.role === "host" ? "Your room" : "Room"} in {c.area_name}</span>}
                    <span className="between" style={{ gap: 8 }}>
                      <span style={{ fontSize: 14, color: unread ? "var(--ink)" : "var(--muted)", fontWeight: unread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mine ? "You: " : ""}{c.last_message_preview}
                      </span>
                      {unread && <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "var(--green)", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread > 98 ? "99+" : c.unread}</span>}
                    </span>
                  </span>
                </Link>
              );
            })}
            {more && <button className="link" style={{ alignSelf: "center", marginTop: 8 }} onClick={() => void loadMore()}>Show older chats</button>}
          </div>
        )}
      </div>
      <TabBar />
    </main>
  );
}

export default function Page() {
  return <RequireAuth next="/inbox"><Inbox /></RequireAuth>;
}
