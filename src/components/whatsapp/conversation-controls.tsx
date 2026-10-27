"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { assignConversation, setConversationStatus } from "@/app/(app)/whatsapp/actions";

export function AssignControl({ id, assigned, team }: { id: string; assigned: string | null; team: { user_id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState(assignConversation, {});
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="conversation_id" value={id} />
      <NativeSelect name="assigned_user_id" defaultValue={assigned ?? ""} className="h-7 w-40 text-xs" aria-label="Assigned to"
        onChange={(e) => e.currentTarget.form?.requestSubmit()} disabled={pending}>
        <option value="">Unassigned</option>
        {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
      </NativeSelect>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function StatusControl({ id, status }: { id: string; status: "open" | "pending" | "resolved" }) {
  const [pending, start] = useTransition();
  const next = status === "resolved" ? "open" : "resolved";
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { await setConversationStatus(id, next); })}>
      {status === "resolved" ? "Reopen" : "Resolve"}
    </Button>
  );
}
