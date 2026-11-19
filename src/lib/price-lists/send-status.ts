// Does each client have its price list up to date? (Gabriel, Nov 19 2026: "a quiénes les hemos actualizado lista y a quiénes no").
// Pure: unit-tested in send-status.test.ts. One state per account and brand; the dashboard shows the worst brand of each account.
//   needs_refresh    — no approved list, or the approved one reached its "valid until" date (every 14 days, SOP P7)
//   waiting_approval — a draft is waiting for the admin
//   not_sent         — approved and still valid, but the client was never sent it (has an older version or none)
//   up_to_date       — the client has the current version and it is still valid

export type ListState = "needs_refresh" | "waiting_approval" | "not_sent" | "up_to_date";
export const LIST_STATES: ListState[] = ["needs_refresh", "waiting_approval", "not_sent", "up_to_date"];

export const LIST_STATE_LABEL: Record<ListState, string> = {
  needs_refresh: "Needs refresh", waiting_approval: "Waiting for approval", not_sent: "Not sent yet", up_to_date: "Up to date",
};
export const LIST_STATE_HINT: Record<ListState, string> = {
  needs_refresh: "No list, or past its valid-until date: prepare the new one",
  waiting_approval: "A draft is waiting for the admin",
  not_sent: "Approved but the client does not have it: send it and Mark as sent",
  up_to_date: "The client has the current version",
};
export const LIST_STATE_STYLE: Record<ListState, string> = {
  needs_refresh: "bg-hkr-red-tint text-hkr-action", waiting_approval: "bg-amber-100 text-amber-900",
  not_sent: "bg-amber-100 text-amber-900", up_to_date: "bg-emerald-100 text-emerald-900",
};

export const isListState = (v: unknown): v is ListState => typeof v === "string" && (LIST_STATES as string[]).includes(v);

export type StateInput = {
  approved: { version: number; valid_until: string | null } | null;
  hasDraft: boolean;
  sentVersion: number | null;   // version of the client's list last marked as sent (same brand)
  today: string;                // yyyy-mm-dd
};

export function listState({ approved, hasDraft, sentVersion, today }: StateInput): ListState {
  if (hasDraft) return "waiting_approval";
  if (!approved || (approved.valid_until && approved.valid_until <= today)) return "needs_refresh";
  if (sentVersion !== approved.version) return "not_sent";
  return "up_to_date";
}

/** The worst of several states (an account with an iPhone and a Samsung list counts once). */
export function worstState(states: ListState[]): ListState {
  return LIST_STATES.find((s) => states.includes(s)) ?? "needs_refresh";
}

/** Counts per state, every state present (0 when none). */
export function countStates(states: ListState[]): Record<ListState, number> {
  const out = { needs_refresh: 0, waiting_approval: 0, not_sent: 0, up_to_date: 0 };
  for (const s of states) out[s]++;
  return out;
}
