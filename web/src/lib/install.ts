"use client";
// Add to home screen + phone notifications. Screens call nudge() right after someone does something
// that means they're waiting on a reply; <InstallHost /> (in the root layout) decides what to show.
// Phones only. Never when already done, at most once a week, and never again after 3 "Not now"s.
import { supabaseBrowser } from "./supabase/client";

export type Reason = "reply" | "request" | "offer" | "viewing" | "host" | "home";
export type Nudge = { reason: Reason; name?: string; explicit?: boolean };

type Store = { shown: Record<string, number>; dismissed: Record<string, number>; visits: number; lastVisit: string; cardHidden: number };
const KEY = "bunkie.install.v1";
const WEEK = 7 * 24 * 3600 * 1000;

export function readStore(): Store {
  const blank: Store = { shown: {}, dismissed: {}, visits: 0, lastVisit: "", cardHidden: 0 };
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return blank;
  }
}
export function writeStore(f: (s: Store) => void) {
  try {
    const s = readStore();
    f(s);
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: prompts just won't remember.
  }
}

/** "install" or "push": may it show now? */
export function mayShow(kind: "install" | "push") {
  const s = readStore();
  return (s.dismissed[kind] ?? 0) < 3 && Date.now() - (s.shown[kind] ?? 0) > WEEK;
}

export type Device = { ios: boolean; android: boolean; phone: boolean; installed: boolean; inApp: string | null; iosNonSafari: boolean };

export function device(): Device {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inApp = /Instagram/.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /WhatsApp/.test(ua) ? "WhatsApp"
    : /TikTok|musical_ly|BytedanceWebview/.test(ua) ? "TikTok" : /Snapchat/.test(ua) ? "Snapchat" : /\bTwitter/.test(ua) ? "X" : null;
  const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return { ios, android, phone: ios || android, installed, inApp, iosNonSafari: ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) };
}

// Android's own install dialog: Chrome fires this once, early; keep it for when we need it.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    track("installed");
  });
}
export const canPromptInstall = () => deferred !== null;

/** Opens Android's install dialog. true if they installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

export function nudge(reason: Reason, name?: string) {
  window.dispatchEvent(new CustomEvent<Nudge>("bunkie:nudge", { detail: { reason, name } }));
}

export function track(name: string, meta: Record<string, unknown> = {}) {
  void supabaseBrowser()?.rpc("track", { p_name: name, p_meta: meta }).then(() => undefined);
}

/** The line at the top of the prompt. */
export function reasonTitle({ reason, name }: Nudge) {
  switch (reason) {
    case "reply": return name ? `Get told when ${name} replies` : "Get told when they reply";
    case "request": return name ? `Get told when ${name} answers` : "Get told when the host answers";
    case "offer": return "Get told when a host offers you a room";
    case "viewing": return "Get a reminder before your viewing";
    case "host": return "Get told when a corper requests your room";
    case "home": return "Add Bunkie to your home screen";
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;

/** iPhones only allow notifications from the home-screen app. */
export const pushPossible = () => pushSupported() && (!device().ios || device().installed);

function keyBytes(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

function deviceLabel() {
  const d = device();
  return `${d.ios ? "iPhone" : d.android ? "Android" : "Computer"}${d.installed ? " app" : ""}`;
}

/** Saves this phone's subscription for whoever is signed in. */
async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = (await supabaseBrowser()?.rpc("save_push", {
    p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_device: deviceLabel(),
  })) ?? {};
  if (error) throw error;
}

/** Asks for permission and turns notifications on for this phone. */
export async function turnOnPush(): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  await save(sub);
  return "granted";
}

export async function turnOffPush() {
  if (!pushSupported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return;
  await supabaseBrowser()?.rpc("drop_push", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export type PushState = "on" | "off" | "blocked" | "unsupported";
export async function pushState(): Promise<PushState> {
  if (!pushPossible()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Keeps this phone tied to whoever is signed in now (after switching accounts). */
export async function resyncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) await save(sub).catch(() => undefined);
}

/** Signing out: stop this phone getting that account's notifications (kept for the next sign-in). */
export async function forgetPush() {
  if (!pushSupported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) await supabaseBrowser()?.rpc("drop_push", { p_endpoint: sub.endpoint });
}
