"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { useMe } from "@/lib/auth";
import {
  canPromptInstall, device, mayShow, promptInstall, pushState, pushSupported, readStore, reasonTitle, resyncPush, track,
  turnOffPush, turnOnPush, writeStore, type Nudge, type PushState,
} from "@/lib/install";
import { AddSquareIcon, BellIcon, MenuDotsIcon, ShareIcon } from "./icons";
import { BunkMark, Sheet, Switch } from "./ui";

type Step = "install" | "push";
type Open = { step: Step; n: Nudge };

// Never interrupt these.
const BUSY = /^\/($|signup|login|verify|reset|auth|welcome|start|ppa|admin)/;

/** What they'd see on their lock screen: the reason, shown rather than explained. */
function Preview({ n }: { n: Nudge }) {
  const who = n.name ?? "Your host";
  const [title, body] = {
    reply: [who, "Sent you a message"],
    request: [`${n.name ?? "The host"} accepted`, "Pick a viewing time."],
    offer: ["Room offered", "A host offered you a room."],
    viewing: ["Viewing in 2 hours", `With ${n.name ?? "your host"}.`],
    host: ["New request", "A corper wants to bunk with you."],
    home: [who, "Sent you a message"],
  }[n.reason];
  return (
    <div className="nprev" aria-hidden="true">
      <div className="nprev-card">
        <span className="nprev-icon"><BunkMark size={18} color="var(--ink)" /></span>
        <span className="stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
          <span className="between"><b>{title}</b><span className="nprev-time">now</span></span>
          <span className="nprev-body">{body}</span>
        </span>
      </div>
    </div>
  );
}

function StepRow({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="lrow" style={{ gap: 12 }}>
      <span className="istep">{n}</span>
      <span style={{ flex: 1 }}>{children}</span>
      <span className="tile t-mint" style={{ width: 36, height: 36, borderRadius: 10 }}>{icon}</span>
    </div>
  );
}

/**
 * Add to home screen and notifications, on phones. Listens for nudge() from screens, and on the
 * first open of the installed app asks for notifications. Mounted once in the root layout.
 */
export function InstallHost() {
  const path = usePathname();
  const [me] = useMe();
  const [open, setOpen] = useState<Open | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const signedIn = useRef(false);
  signedIn.current = !!me;
  const pathRef = useRef(path);
  pathRef.current = path;

  const pushAskable = () => signedIn.current && pushSupported() && Notification.permission === "default";

  const show = (step: Step, n: Nudge) => {
    writeStore((s) => { s.shown[step] = Date.now(); });
    track(`${step}_shown`, { reason: n.reason });
    setBlocked(false);
    setCopied(false);
    setOpen({ step, n });
  };

  // Count days visited (the Home card waits for the second).
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    writeStore((s) => { if (s.lastVisit !== today) { s.visits += 1; s.lastVisit = today; } });
  }, []);

  // Signed in on a phone that already has notifications: keep them going to this account.
  useEffect(() => { if (me) void resyncPush(); }, [me]);

  // First open from the home screen: ask for notifications once.
  useEffect(() => {
    if (!me) return;
    const d = device();
    if (!d.installed) return;
    let first = false;
    writeStore((s) => { if (!s.shown.opened) { s.shown.opened = Date.now(); first = true; } });
    if (first) track("opened_installed");
    if (pushAskable() && mayShow("push") && !BUSY.test(pathRef.current)) {
      const t = setTimeout(() => show("push", { reason: "home" }), 1200);
      return () => clearTimeout(t);
    }
  }, [me]);

  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<Nudge>).detail;
      const d = device();
      if (!d.phone || BUSY.test(pathRef.current)) return;
      let step: Step | null = null;
      if (d.installed) step = pushAskable() && (n.explicit || mayShow("push")) ? "push" : null;
      else if (n.explicit || mayShow("install")) step = "install";
      else if (d.android && pushAskable() && mayShow("push")) step = "push";
      if (!step) return;
      const s = step;
      setTimeout(() => show(s, n), n.explicit ? 0 : 900);   // let the next screen settle first
    };
    window.addEventListener("bunkie:nudge", on);
    return () => window.removeEventListener("bunkie:nudge", on);
  }, []);

  if (!open) return null;
  const d = device();
  const { step, n } = open;

  const notNow = () => {
    writeStore((s) => { s.dismissed[step] = (s.dismissed[step] ?? 0) + 1; });
    track(`${step}_dismissed`, { reason: n.reason });
    setOpen(null);
  };
  const done = () => setOpen(null);

  const install = async () => {
    setBusy(true);
    const ok = await promptInstall();
    setBusy(false);
    track(ok ? "install_accepted" : "install_dismissed", { reason: n.reason, native: true });
    if (!ok) return notNow();
    // Android: the permission carries over to the installed app, so ask right away.
    if (pushAskable()) setOpen({ step: "push", n });
    else done();
  };

  const notify = async () => {
    setBusy(true);
    const r = await turnOnPush().catch(() => "default" as const);
    setBusy(false);
    track(r === "granted" ? "push_granted" : "push_denied", { reason: n.reason });
    if (r === "denied") return setBlocked(true);
    done();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const title = step === "push" && n.reason === "home" ? "Get told when hosts reply" : reasonTitle(n);
  const browser = d.ios ? "Safari" : "Chrome";

  return (
    <Sheet onClose={notNow} label={title}>
      <div className="stack" style={{ padding: "14px 20px calc(16px + var(--safe-bottom))", gap: 16 }}>
        <Preview n={n} />
        <h2 className="h2" style={{ fontSize: 22, textAlign: "center", padding: "0 8px" }}>{title}</h2>

        {step === "push" ? (
          blocked ? (
            <p className="small" style={{ textAlign: "center" }}>Notifications are off for Bunkie. Turn them on in your phone&apos;s Settings.</p>
          ) : (
            <button className="btn" disabled={busy} onClick={notify}>{busy ? <span className="spin" /> : <><BellIcon size={20} />Turn on notifications</>}</button>
          )
        ) : d.inApp ? (
          <>
            <p className="small" style={{ textAlign: "center" }}>Open this page in {browser} to add Bunkie to your home screen.</p>
            <button className="btn" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          </>
        ) : d.android && canPromptInstall() ? (
          <button className="btn" disabled={busy} onClick={install}>{busy ? <span className="spin" /> : <><AddSquareIcon size={20} />Add to home screen</>}</button>
        ) : (
          <>
            <div className="lrows" style={{ boxShadow: "none", background: "var(--soft)" }}>
              {d.ios ? (
                <>
                  <StepRow n={1} icon={<ShareIcon size={20} />}>Tap <b>Share</b>{d.iosNonSafari ? " in the address bar" : ""}</StepRow>
                  <StepRow n={2} icon={<AddSquareIcon size={20} />}>Tap <b>Add to Home Screen</b></StepRow>
                </>
              ) : (
                <>
                  <StepRow n={1} icon={<MenuDotsIcon size={20} />}>Tap the <b>menu</b> at the top</StepRow>
                  <StepRow n={2} icon={<AddSquareIcon size={20} />}>Tap <b>Add to home screen</b></StepRow>
                </>
              )}
              <StepRow n={3} icon={<BunkMark size={18} />}>Open Bunkie from your home screen</StepRow>
            </div>
            <button className="btn" onClick={() => { track("install_accepted", { reason: n.reason, manual: true }); done(); }}>Got it</button>
          </>
        )}
        {!blocked && <button className="link" onClick={notNow}>Not now</button>}
        {blocked && <button className="link" onClick={done}>Close</button>}
      </div>
    </Sheet>
  );
}

/**
 * Home: a quiet card from the second day on. Not installed: add to home screen. Installed but
 * notifications off: turn them on. ✕ hides it for two weeks.
 */
export function InstallCard({ style }: { style?: CSSProperties }) {
  const [me] = useMe();
  const [kind, setKind] = useState<Step | null>(null);
  useEffect(() => {
    const d = device();
    const s = readStore();
    if (!d.phone || s.visits < 2 || Date.now() - s.cardHidden < 14 * 24 * 3600 * 1000) return;
    if (!d.installed) return setKind("install");
    if (me) void pushState().then((p) => setKind(p === "off" && Notification.permission === "default" ? "push" : null));
  }, [me]);
  if (!kind) return null;
  const hide = () => {
    writeStore((s) => { s.cardHidden = Date.now(); });
    track(`${kind}_dismissed`, { reason: "card" });
    setKind(null);
  };
  const tap = () => window.dispatchEvent(new CustomEvent("bunkie:nudge", { detail: { reason: "home", explicit: true } }));
  return (
    <div className="row card" style={{ padding: "12px 8px 12px 14px", borderRadius: 18, gap: 12, ...style }}>
      <button className="row" onClick={tap} style={{ flex: 1, gap: 12, background: "none", border: 0, padding: 0, textAlign: "left", color: "var(--ink)" }}>
        <span className="tile t-mint">{kind === "install" ? <AddSquareIcon size={20} /> : <BellIcon size={20} />}</span>
        <span className="stack" style={{ gap: 1 }}>
          <b style={{ fontSize: 15 }}>{kind === "install" ? "Add Bunkie to your home screen" : "Turn on notifications"}</b>
          <span className="small">Get told when hosts reply.</span>
        </span>
      </button>
      <button className="ib" onClick={hide} aria-label="Hide"><X size={18} /></button>
    </div>
  );
}

/** Profile: notifications on or off for this phone. On an iPhone browser it leads to the home screen first. */
export function NotificationsRow() {
  const [state, setState] = useState<PushState | "ios-browser" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = device();
    if (d.ios && !d.installed) return setState("ios-browser");
    void pushState().then(setState);
  }, []);
  if (!state || state === "unsupported") return null;
  const label = (
    <>
      <span className="tile t-mint"><BellIcon size={20} /></span>
      <span className="stack" style={{ flex: 1, gap: 1 }}>
        <span>Notifications</span>
        {state === "blocked" && <span className="small">Turned off in your phone&apos;s Settings</span>}
        {state === "ios-browser" && <span className="small">Add Bunkie to your home screen first</span>}
      </span>
    </>
  );
  if (state === "ios-browser") {
    return <button className="lrow" onClick={() => window.dispatchEvent(new CustomEvent("bunkie:nudge", { detail: { reason: "home", explicit: true } }))}>{label}</button>;
  }
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const r = await turnOnPush();
        track(r === "granted" ? "push_granted" : "push_denied", { reason: "profile" });
      } else {
        await turnOffPush();
      }
    } finally {
      setState(await pushState());
      setBusy(false);
    }
  };
  return (
    <div className="lrow">
      {label}
      {state !== "blocked" && (busy ? <span className="spin dark" /> : <Switch on={state === "on"} onChange={toggle} label="Notifications" />)}
    </div>
  );
}
