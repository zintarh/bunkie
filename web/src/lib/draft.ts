"use client";

/** A request being put together. Survives the sign-up, questions and verification detours. */
/** weeks is set for a short stay (1-4 weeks); otherwise the stay is `months` long. */
export type RequestDraft = { listingId: string; hostName: string; moveIn: string; months: number; weeks?: number | null; message: string };

const KEY = "bunkie.requestDraft.v1";

export function saveDraft(d: RequestDraft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Storage blocked: the request page asks for dates again.
  }
}

export function loadDraft(listingId: string): RequestDraft | null {
  try {
    const d = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as RequestDraft | null;
    return d && d.listingId === listingId ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
