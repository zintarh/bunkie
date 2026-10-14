/** Listing steps in order (the editor in app/host/listing/[id] uses this list). */
export const HOST_STEPS = ["location", "photos", "room", "costs", "rules", "refunds"] as const;

/** Where to reopen a draft: the first unfinished step, or the review once all are done. */
export const resumeHref = (l: { id: string; draft_step: number }) =>
  `/host/listing/${l.id}?step=${HOST_STEPS[l.draft_step] ?? "review"}`;

export const draftProgress = (l: { draft_step: number }) => Math.min(1, l.draft_step / HOST_STEPS.length);

export const draftLabel = (l: { draft_step: number }) =>
  l.draft_step >= HOST_STEPS.length ? "Ready to publish" : `${l.draft_step} of ${HOST_STEPS.length} steps done`;
