"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMe } from "./auth";
import { setPrefs, usePrefs } from "./prefs";
import { supabaseBrowser } from "./supabase/client";

/** Saved rooms: on the phone when signed out, in the account when signed in (phone saves are copied up once). */
/** [saved ids, toggle, ready]. ready is false until we know whose saves to show (phone or account). */
export function useSaved(): [Set<string>, (id: string) => void, boolean] {
  const [me, meLoading] = useMe();
  const [prefs, prefsReady] = usePrefs();
  const [remote, setRemote] = useState<Set<string> | null>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!me || !db) {
      setRemote(null);
      return;
    }
    let live = true;
    (async () => {
      const local = prefs.saved.filter((id) => !id.startsWith("demo-"));
      if (local.length) {
        await db.from("saved_rooms").upsert(local.map((listing_id) => ({ user_id: me.user.id, listing_id })), { ignoreDuplicates: true });
        setPrefs({ saved: [] });
      }
      const { data } = await db.from("saved_rooms").select("listing_id");
      if (live) setRemote(new Set((data ?? []).map((r) => r.listing_id as string)));
    })();
    return () => {
      live = false;
    };
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = useMemo(() => remote ?? new Set(prefs.saved), [remote, prefs.saved]);

  const toggle = useCallback(
    (id: string) => {
      const db = supabaseBrowser();
      const has = ids.has(id);
      if (me && db && remote && !id.startsWith("demo-")) {
        const next = new Set(remote);
        if (has) next.delete(id);
        else next.add(id);
        setRemote(next);
        const q = has
          ? db.from("saved_rooms").delete().eq("listing_id", id)
          : db.from("saved_rooms").insert({ user_id: me.user.id, listing_id: id });
        void q.then(({ error }) => error && setRemote(remote));
      } else {
        setPrefs((p) => ({ saved: has ? p.saved.filter((x) => x !== id) : [...p.saved, id] }));
      }
    },
    [ids, me, remote],
  );
  const ready = prefsReady && !meLoading && (!me || remote !== null);
  return [ids, toggle, ready];
}
