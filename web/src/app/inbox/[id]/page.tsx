"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, BellOff, Ban, ChevronLeft, CircleAlert, Flag, ImagePlus, Lock, MoreVertical, RotateCw, SendHorizontal, ShieldCheck } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { Loading, Sheet, useToast } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { useChat, useChatImages, type Message } from "@/lib/chat";
import { nudge } from "@/lib/install";
import { chatDay, initial, timeLabel } from "@/lib/format";
import { avatarUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";

type Person = { id: string; first_name: string; photo_path: string | null; is_verified: boolean };
type Meta = {
  id: string; contacts_unlocked: boolean; booking_id: string | null; listing_id: string | null;
  tenant_id: string; host_id: string;
  listing: { id: string; area_name: string } | null;
  booking: { id: string; status: string } | null;
  tenant: Person; host: Person;
};

function Chat() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [me] = useMe();
  const [meta, setMeta] = useState<Meta | null | undefined>(undefined);
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState(false);
  const [text, setText] = useState("");
  const [toast, showToast] = useToast();
  const chat = useChat(id);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef(0);
  const loadingOlder = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me) return;
    const P = "id, first_name, photo_path, is_verified";
    db.from("conversations").select(`id, contacts_unlocked, booking_id, listing_id, tenant_id, host_id,
        listing:listings(id, area_name), booking:bookings!conversations_booking_id_fkey(id, status),
        tenant:profiles!conversations_tenant_id_fkey(${P}), host:profiles!conversations_host_id_fkey(${P})`)
      .eq("id", id).maybeSingle()
      .then(({ data }) => setMeta((data as unknown as Meta) ?? null));
    db.from("conversation_members").select("muted").eq("conversation_id", id).eq("user_id", me.user.id).maybeSingle()
      .then(({ data }) => setMuted(!!data?.muted));
  }, [id, me]);

  // Paying unlocks contact details; the "Paid" message arrives live, so update without a reload.
  const unlocked = !!meta?.contacts_unlocked || !!chat.messages?.some((m) => m.kind === "system" && m.meta?.status === "paid");

  // Keep the newest message in view, and keep the reading position when older messages load above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !chat.messages) return;
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      loadingOlder.current = false;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat.messages, chat.typing]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && chat.hasOlder && !loadingOlder.current) {
      loadingOlder.current = true;
      prevHeight.current = el.scrollHeight;
      void chat.loadOlder();
    }
  };

  const imagePaths = useMemo(() => (chat.messages ?? []).flatMap((m) => (m.image_path ? [m.image_path] : [])), [chat.messages]);
  const images = useChatImages(imagePaths);

  if (meta === undefined || !chat.messages) return <Loading />;
  if (meta === null) {
    return <main className="screen" style={{ alignItems: "center", justifyContent: "center", gap: 12 }}><span className="h2">Chat not found</span><Link className="btn" href="/inbox">Back to messages</Link></main>;
  }

  const myId = me!.user.id;
  const other = myId === meta.tenant_id ? meta.host : meta.tenant;
  const iAmHost = myId === meta.host_id;
  const photo = avatarUrl(other.photo_path);
  const lastMine = [...chat.messages].reverse().find((m) => m.sender_id === myId && !m.pending);

  const submit = () => {
    if (!text.trim()) return;
    atBottom.current = true;
    chat.send(text);
    nudge("reply", other.first_name);
    setText("");
    requestAnimationFrame(() => box.current?.focus());
  };

  const act = async (what: "mute" | "report" | "block") => {
    const db = supabaseBrowser();
    if (!db) return;
    setMenu(false);
    if (what === "mute") {
      await db.rpc("set_chat_prefs", { p_conversation: id, p_muted: !muted });
      setMuted(!muted);
      return showToast(muted ? "Notifications on" : "Muted");
    }
    if (what === "report") {
      const theirs = [...chat.messages!].reverse().find((m) => m.sender_id === other.id);
      if (!theirs) return showToast("Nothing to report yet");
      const { error } = await db.rpc("report_message", { p_message: theirs.id, p_reason: "reported_from_chat" });
      return showToast(error ? errorText(error) : "Reported. Bunkie will review this chat.");
    }
    const { error } = await db.from("blocks").insert({ blocker_id: myId, blocked_id: other.id });
    showToast(error && !/duplicate/i.test(error.message) ? errorText(error) : `${other.first_name} is blocked`);
    router.replace("/inbox");
  };

  return (
    <main className="screen" style={{ background: "#F4F7F5" }}>
      <header className="topbar" style={{ background: "#fff", borderBottom: "1px solid var(--line)", padding: "0 6px", height: 64 }}>
        <Link className="ib mob-only" href="/inbox" aria-label="Back to messages"><ChevronLeft size={24} strokeWidth={2.2} /></Link>
        <span className="avatar" style={{ width: 40, height: 40 }}>{photo ? <img src={photo} alt="" /> : initial(other.first_name)}</span>
        <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <span className="row" style={{ gap: 4, fontWeight: 800 }}>
            {other.first_name}{other.is_verified && <BadgeCheck size={16} color="var(--green)" aria-label="Verified" />}
          </span>
          <span className="small" style={{ fontSize: 12, color: chat.typing || chat.online ? "var(--green-text)" : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {chat.typing ? "typing…" : chat.online ? "Online" : meta.listing ? `${iAmHost ? "Your room" : "Room"} in ${meta.listing.area_name}` : ""}
          </span>
        </span>
        {meta.booking ? (
          <Link className="pill" href={`/bookings/${meta.booking.id}`}>Booking</Link>
        ) : meta.listing && !iAmHost ? (
          <Link className="pill" href={`/rooms/${meta.listing.id}`}>Room</Link>
        ) : null}
        <button className="ib" onClick={() => setMenu(true)} aria-label="Chat options"><MoreVertical size={20} /></button>
      </header>

      <div ref={scroller} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px", display: "flex", flexDirection: "column", gap: 4 }}>
        {!unlocked && (
          <div className="row" style={{ gap: 10, alignSelf: "center", maxWidth: 340, background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 12px", margin: "4px 0 10px", fontSize: 13, lineHeight: 1.45 }}>
            <Lock size={16} color="var(--green-text)" style={{ flexShrink: 0 }} />
            <span>Phone numbers and account details stay hidden until you pay. Only pay through Bunkie.</span>
          </div>
        )}
        {chat.hasOlder && <span className="small" style={{ alignSelf: "center", padding: 8 }}>Loading earlier messages…</span>}
        {chat.messages.map((m, i) => {
          const prev = chat.messages![i - 1];
          const newDay = !prev || chatDay(prev.created_at) !== chatDay(m.created_at);
          return (
            <Fragment key={m.client_id ?? m.id}>
              {newDay && <span className="small" style={{ alignSelf: "center", padding: "10px 0 6px", fontSize: 12, fontWeight: 700 }}>{chatDay(m.created_at)}</span>}
              <Bubble m={m} mine={m.sender_id === myId} grouped={!!prev && !newDay && prev.sender_id === m.sender_id && prev.kind !== "system"}
                image={m.image_path ? images[m.image_path] : undefined} onRetry={() => chat.retry(m)}
                seen={lastMine?.id === m.id && chat.otherLastRead >= m.id} bookingId={meta.booking_id} />
            </Fragment>
          );
        })}
        {chat.typing && <span className="bubble theirs typing" aria-label={`${other.first_name} is typing`}><i /><i /><i /></span>}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <button type="button" className="ib" aria-label="Send a photo" onClick={() => fileInput.current?.click()}><ImagePlus size={22} /></button>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) { atBottom.current = true; chat.send("", f); }
        }} />
        <textarea ref={box} rows={1} value={text} maxLength={2000} placeholder="Message" aria-label="Message"
          onChange={(e) => { setText(e.target.value); chat.sendTyping(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); submit(); } }}
          style={{ height: Math.min(120, 22 * Math.max(1, text.split("\n").length) + 22) }} />
        <button type="submit" className="send" disabled={!text.trim()} aria-label="Send"><SendHorizontal size={20} /></button>
      </form>

      {menu && (
        <Sheet onClose={() => setMenu(false)} label="Chat options">
          <div className="lrows" style={{ boxShadow: "none", padding: 0 }}>
            <button className="lrow" onClick={() => act("mute")}><span className="tile t-sky"><BellOff size={20} /></span>{muted ? "Unmute" : "Mute"}</button>
            <button className="lrow" onClick={() => act("report")}><span className="tile t-amber"><Flag size={20} /></span>Report {other.first_name}</button>
            <button className="lrow" onClick={() => act("block")}><span className="tile t-coral"><Ban size={20} /></span>Block {other.first_name}</button>
          </div>
          <p className="note" style={{ marginTop: 12 }}><ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />Asked to pay outside Bunkie? Report it. Bunkie never asks you to send money to a person.</p>
        </Sheet>
      )}
      {toast}
    </main>
  );
}

function Bubble({ m, mine, grouped, image, onRetry, seen, bookingId }: {
  m: Message; mine: boolean; grouped: boolean; image?: string; onRetry: () => void; seen: boolean; bookingId: string | null;
}) {
  if (m.kind === "system") {
    if (m.meta?.type === "offer" && typeof m.meta.listing_id === "string") {
      return (
        <Link href={`/rooms/${m.meta.listing_id}`} className="card stack" style={{ alignSelf: "center", maxWidth: 320, gap: 6, padding: 14, margin: "8px 0", color: "var(--ink)" }}>
          <span className="small" style={{ fontWeight: 700, color: "var(--green-text)" }}>Room offered</span>
          <span style={{ fontSize: 15 }}>{m.body}</span>
          <span className="btn sm" style={{ marginTop: 4 }}>See room</span>
        </Link>
      );
    }
    const safety = m.meta?.type === "pay_safety";
    const link = m.meta?.type === "booking" && bookingId ? `/bookings/${bookingId}` : null;
    const inner = (
      <>
        {safety ? <CircleAlert size={14} style={{ flexShrink: 0 }} /> : <ShieldCheck size={14} style={{ flexShrink: 0 }} />}
        <span>{m.body}</span>
      </>
    );
    return link
      ? <Link href={link} className={safety ? "sysmsg warn" : "sysmsg"}>{inner}</Link>
      : <span className={safety ? "sysmsg warn" : "sysmsg"}>{inner}</span>;
  }
  const src = m.localImage ?? image;
  return (
    <div className={mine ? "msg mine" : "msg"} style={{ marginTop: grouped ? 0 : 6 }}>
      <div className={`bubble ${mine ? "mine" : "theirs"}${m.kind === "image" ? " pic" : ""}${m.failed ? " failed" : ""}`}>
        {m.kind === "image" && (
          src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={src} alt="Photo" style={{ aspectRatio: m.image_w && m.image_h ? `${m.image_w} / ${m.image_h}` : undefined }} />
            : <span className="img-wait" style={{ aspectRatio: m.image_w && m.image_h ? `${m.image_w} / ${m.image_h}` : "4 / 3" }} />
        )}
        {m.body && <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</span>}
        <span className="when">
          {m.redacted && <Lock size={11} aria-label="Contact details hidden" />}
          {timeLabel(m.created_at)}
        </span>
      </div>
      {m.failed ? (
        <button className="retry" onClick={onRetry}><RotateCw size={13} />Not sent. Tap to retry</button>
      ) : m.pending ? (
        <span className="status">Sending…</span>
      ) : seen ? <span className="status">Seen</span> : null}
    </div>
  );
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <RequireAuth next={`/inbox/${id}`}><Chat /></RequireAuth>;
}
