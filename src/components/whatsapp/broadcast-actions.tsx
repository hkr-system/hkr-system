"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveBroadcast, cancelBroadcast, pauseBroadcast, resumeBroadcast, submitForApproval, type BcState } from "@/app/(app)/whatsapp/broadcasts/actions";

export function BroadcastActions({ id, status, isAdmin, isOwner }: { id: string; status: string; isAdmin: boolean; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<BcState>({});
  const run = (fn: (id: string) => Promise<BcState>) => start(async () => setRes(await fn(id)));
  const editable = isAdmin || isOwner;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="broadcast-actions">
      {status === "draft" && editable ? <Button size="sm" disabled={pending} onClick={() => run(submitForApproval)}>Submit for approval</Button> : null}
      {isAdmin && (status === "draft" || status === "pending_approval") ? (
        <Button size="sm" disabled={pending} onClick={() => run(approveBroadcast)}>Approve and send</Button>
      ) : null}
      {isAdmin && (status === "sending" || status === "approved") ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(pauseBroadcast)}>Pause</Button> : null}
      {isAdmin && status === "paused" ? <Button size="sm" disabled={pending} onClick={() => run(resumeBroadcast)}>Resume</Button> : null}
      {editable && ["draft", "pending_approval", "approved", "paused"].includes(status) ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(cancelBroadcast)}>Cancel</Button>
      ) : null}
      {res.error ? <span className="text-sm text-destructive">{res.error}</span> : null}
    </div>
  );
}
