"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markUpdateSent } from "@/app/(app)/dashboard/actions";

// "Reminded today": logs a balance reminder so the daily report says "reminded dd-mmm (1st / 2nd)" (SOP P9).
export function ReminderButton({ accountId, orderId, done }: { accountId: string; orderId: string; done: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (done) return <span className="text-xs text-emerald-700">Reminded today</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="xs" variant="outline" disabled={pending} data-testid="remind-balance"
        onClick={() => start(async () => { const r = await markUpdateSent({ account_id: accountId, kind: "balance_reminder", order_ids: [orderId] }); if (r.error) setError(r.error); })}>
        {pending ? "…" : "I reminded the client today"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
