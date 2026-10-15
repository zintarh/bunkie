"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useMe } from "./auth";
import { shrinkFile } from "./image";
import { supabaseBrowser } from "./supabase/client";
import type { BookingStatus } from "./types";

// Chat runs on three things:
//  * Postgres is the record: messages are written only by send_message() and read with keyset paging.
//  * Realtime Broadcast (private channels) pushes new messages, reads and inbox changes as they happen.
//    The database sends message events itself, so nothing is lost if the sender's phone drops.
//  * The phone shows a message the moment it's sent (pending), confirms it when the database answers,
//    and resends with the same client id after a failure, so retries never duplicate.

export type Message = {
  id: number;                 // negative while pending on this phone
  conversation_id: string;
  sender_id: string | null;   // null: Bunkie
  kind: "text" | "image" | "system";
  body: string | null;
  image_path: string | null;
  image_w: number | null;
  image_h: number | null;
  meta: Record<string, unknown>;
  client_id: string | null;
  redacted: boolean;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  localImage?: string;        // object URL shown while a photo uploads
};

export type InboxRow = {
  id: string; listing_id: string | null; booking_id: string | null; booking_status: BookingStatus | null; role: "tenant" | "host";
  other_id: string; other_name: string; other_photo: string | null; other_verified: boolean;
  area_name: string | null; cover_path: string | null;
  last_message_id: number; last_message_at: string; last_message_preview: string | null; last_sender_id: string | null;
  unread: number; muted: boolean; other_last_read_id: number; contacts_unlocked: boolean;
};

const PAGE = 30;

/** Joins a private Realtime channel with the signed-in user's token. */
async function privateChannel(topic: string, opts: { presenceKey?: string } = {}): Promise<RealtimeChannel | null> {
  const db = supabaseBrowser();
  if (!db) return null;
  await db.realtime.setAuth();
  return db.channel(topic, { config: { private: true, broadcast: { self: false }, ...(opts.presenceKey ? { presence: { key: opts.presenceKey } } : {}) } });
}

// ---------------------------------------------------------------------------
// Unread count for the tab bar, kept live by the user's inbox channel.
// ---------------------------------------------------------------------------
export function useUnreadChats(): number {
  const [me] = useMe();
  const [n, setN] = useState(0);
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me) return setN(0);
    let live = true;
    let ch: RealtimeChannel | null = null;
    let t: ReturnType<typeof setTimeout> | undefined;
    const load = () => db.rpc("unread_chats").then(({ data }) => live && setN((data as number) ?? 0));
    void load();
    void privateChannel(`inbox:${me.user.id}`).then((c) => {
      if (!c || !live) return;
      ch = c.on("broadcast", { event: "*" }, () => {
        clearTimeout(t);
        t = setTimeout(load, 400);
      }).subscribe();
    });
    return () => {
      live = false;
      clearTimeout(t);
      if (ch) void db.removeChannel(ch);
    };
  }, [me]);
  return n;
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
export function useInbox(archived = false) {
  const [me] = useMe();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    if (!db) return;
    const { data } = await db.rpc("my_conversations", { p_limit: PAGE, p_archived: archived });
    const list = (data ?? []) as InboxRow[];
    setRows(list);
    setMore(list.length === PAGE);
  }, [archived]);

  const loadMore = useCallback(async () => {
    const db = supabaseBrowser();
    const last = rows?.[rows.length - 1];
    if (!db || !last) return;
    const { data } = await db.rpc("my_conversations", { p_limit: PAGE, p_before: last.last_message_at, p_archived: archived });
    const list = (data ?? []) as InboxRow[];
    setRows((r) => [...(r ?? []), ...list.filter((x) => !r?.some((y) => y.id === x.id))]);
    setMore(list.length === PAGE);
  }, [rows, archived]);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me) return;
    let live = true;
    let ch: RealtimeChannel | null = null;
    let t: ReturnType<typeof setTimeout> | undefined;
    void load();
    void privateChannel(`inbox:${me.user.id}`).then((c) => {
      if (!c || !live) return;
      ch = c.on("broadcast", { event: "*" }, () => {
        clearTimeout(t);
        t = setTimeout(load, 300);
      }).subscribe();
    });
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      clearTimeout(t);
      window.removeEventListener("focus", onFocus);
      if (ch) void db.removeChannel(ch);
    };
  }, [me, load]);

  return { rows, more, loadMore, reload: load };
}

// ---------------------------------------------------------------------------
// One conversation
// ---------------------------------------------------------------------------
const sortById = (a: Message, b: Message) =>
  (a.pending ? Number.MAX_SAFE_INTEGER : a.id) - (b.pending ? Number.MAX_SAFE_INTEGER : b.id) || a.created_at.localeCompare(b.created_at);

/** Adds or replaces messages (a confirmed message replaces its pending copy by client id). */
function merge(list: Message[], incoming: Message[]): Message[] {
  const out = [...list];
  for (const m of incoming) {
    const i = out.findIndex((x) => x.id === m.id || (m.client_id && x.client_id === m.client_id));
    if (i >= 0) out[i] = { ...m, localImage: out[i].localImage };
    else out.push(m);
  }
  return out.sort(sortById);
}

export function useChat(conversationId: string) {
  const [me] = useMe();
  const myId = me?.user.id;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [otherLastRead, setOtherLastRead] = useState(0);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const latest = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingSent = useRef(0);

  const track = (list: Message[]) => {
    const top = list.reduce((m, x) => (x.id > m && !x.pending ? x.id : m), 0);
    if (top > latest.current) latest.current = top;
  };

  // First page, and the other person's read position.
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !myId) return;
    let live = true;
    (async () => {
      const [{ data }, { data: members }] = await Promise.all([
        db.from("messages").select("*").eq("conversation_id", conversationId).order("id", { ascending: false }).limit(PAGE),
        db.from("conversation_members").select("user_id, last_read_id").eq("conversation_id", conversationId),
      ]);
      if (!live) return;
      const list = ((data ?? []) as Message[]).reverse();
      track(list);
      setMessages(list);
      setHasOlder((data ?? []).length === PAGE);
      setOtherLastRead((members ?? []).find((m) => m.user_id !== myId)?.last_read_id ?? 0);
    })();
    return () => {
      live = false;
    };
  }, [conversationId, myId]);

  // Fills any gap after a reconnect (messages sent while the phone was offline).
  const catchUp = useCallback(async () => {
    const db = supabaseBrowser();
    if (!db) return;
    const { data } = await db.from("messages").select("*").eq("conversation_id", conversationId)
      .gt("id", latest.current).order("id", { ascending: true }).limit(200);
    if (data?.length) {
      track(data as Message[]);
      setMessages((list) => merge(list ?? [], data as Message[]));
    }
  }, [conversationId]);

  // Live: new messages, reads, typing and who's here.
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !myId) return;
    let live = true;
    void privateChannel(`chat:${conversationId}`, { presenceKey: myId }).then((c) => {
      if (!c || !live) return;
      channel.current = c
        .on("broadcast", { event: "message" }, ({ payload }) => {
          const m = payload as Message;
          track([m]);
          setMessages((list) => merge(list ?? [], [m]));
          if (m.sender_id && m.sender_id !== myId) setTyping(false);
        })
        .on("broadcast", { event: "read" }, ({ payload }) => {
          if (payload.user_id !== myId) setOtherLastRead((n) => Math.max(n, Number(payload.last_read_id)));
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload.user_id === myId) return;
          setTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(false), 4000);
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.current?.presenceState() ?? {};
          setOnline(Object.keys(state).some((k) => k !== myId));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void channel.current?.track({ at: Date.now() });
            void catchUp();
          }
        });
    });
    const onOnline = () => void catchUp();
    window.addEventListener("online", onOnline);
    return () => {
      live = false;
      clearTimeout(typingTimer.current);
      window.removeEventListener("online", onOnline);
      if (channel.current) void db.removeChannel(channel.current);
      channel.current = null;
    };
  }, [conversationId, myId, catchUp]);

  const loadOlder = useCallback(async () => {
    const db = supabaseBrowser();
    const oldest = messages?.find((m) => !m.pending);
    if (!db || !oldest) return;
    const { data } = await db.from("messages").select("*").eq("conversation_id", conversationId)
      .lt("id", oldest.id).order("id", { ascending: false }).limit(PAGE);
    setMessages((list) => merge(list ?? [], (data ?? []) as Message[]));
    setHasOlder((data ?? []).length === PAGE);
  }, [conversationId, messages]);

  const files = useRef(new Map<string, File | undefined>());

  // Sends (or resends) one message. Same client id on retry, so it can't arrive twice.
  const deliver = useCallback(async (m: Message, file?: File) => {
    const db = supabaseBrowser();
    if (!db) return;
    setMessages((list) => merge(list ?? [], [{ ...m, pending: true, failed: false }]));
    try {
      let path = m.image_path;
      let w = m.image_w;
      let h = m.image_h;
      if (file && !path) {
        const img = await shrinkFile(file, 1280, 0.78);
        path = `${conversationId}/${m.client_id}.${img.ext}`;
        const up = await db.storage.from("chat-media").upload(path, img.blob, { contentType: img.blob.type, upsert: true });
        if (up.error) throw up.error;
        w = img.width;
        h = img.height;
      }
      const { data, error } = await db.rpc("send_message", {
        p_conversation: conversationId, p_client_id: m.client_id, p_body: m.body,
        p_image_path: path, p_image_w: w, p_image_h: h,
      });
      if (error) throw error;
      track([data as Message]);
      setMessages((list) => merge(list ?? [], [data as Message]));
      return null;
    } catch (e) {
      setMessages((list) => merge(list ?? [], [{ ...m, pending: true, failed: true }]));
      return e;
    }
  }, [conversationId]);

  const send = useCallback((body: string, file?: File) => {
    if (!myId) return;
    const client_id = crypto.randomUUID();
    const m: Message = {
      id: -Date.now(), conversation_id: conversationId, sender_id: myId, kind: file ? "image" : "text",
      body: body.trim() || null, image_path: null, image_w: null, image_h: null, meta: {}, client_id,
      redacted: false, created_at: new Date().toISOString(), localImage: file ? URL.createObjectURL(file) : undefined,
    };
    files.current.set(client_id, file);
    void deliver(m, file);
  }, [conversationId, myId, deliver]);

  const retry = useCallback((m: Message) => void deliver(m, m.client_id ? files.current.get(m.client_id) : undefined), [deliver]);

  // Failed sends retry by themselves when the connection comes back.
  useEffect(() => {
    const onOnline = () => messages?.filter((m) => m.failed).forEach(retry);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [messages, retry]);

  /** Tells the other person "typing…" at most every 2 seconds. */
  const sendTyping = useCallback(() => {
    if (!myId || Date.now() - lastTypingSent.current < 2000) return;
    lastTypingSent.current = Date.now();
    void channel.current?.send({ type: "broadcast", event: "typing", payload: { user_id: myId } });
  }, [myId]);

  // Mark as read while the chat is open and the page is visible.
  const readUpTo = useRef(0);
  useEffect(() => {
    const db = supabaseBrowser();
    const top = latest.current;
    if (!db || !top || top <= readUpTo.current) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || latest.current <= readUpTo.current) return;
      readUpTo.current = latest.current;
      void db.rpc("mark_read", { p_conversation: conversationId, p_message: latest.current });
    };
    const t = setTimeout(mark, 300);
    document.addEventListener("visibilitychange", mark);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [messages, conversationId]);

  return { messages, hasOlder, loadOlder, send, retry, sendTyping, typing, online, otherLastRead };
}

// ---------------------------------------------------------------------------
// Photos: short-lived signed links, fetched in batches and reused.
// ---------------------------------------------------------------------------
const signed = new Map<string, { url: string; until: number }>();

export function useChatImages(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("|");
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db) return;
    const now = Date.now();
    const known: Record<string, string> = {};
    const need: string[] = [];
    for (const p of paths) {
      const s = signed.get(p);
      if (s && s.until > now + 60000) known[p] = s.url;
      else need.push(p);
    }
    setUrls(known);
    if (!need.length) return;
    let live = true;
    db.storage.from("chat-media").createSignedUrls(need, 3600).then(({ data }) => {
      for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, { url: d.signedUrl, until: now + 3600_000 });
      if (live) setUrls(Object.fromEntries(paths.flatMap((p) => (signed.get(p) ? [[p, signed.get(p)!.url]] : []))));
    });
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

/** Opens (or creates) the chat with a room's host and returns its id. */
export async function openChat(listingId: string): Promise<string> {
  const db = supabaseBrowser();
  if (!db) throw new Error("Connect Supabase first.");
  const { data, error } = await db.rpc("start_conversation", { p_listing: listingId });
  if (error) throw error;
  return data as string;
}
