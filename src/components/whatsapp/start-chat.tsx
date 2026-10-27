"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { startConversation } from "@/app/(app)/whatsapp/actions";

export function StartChat({ leadId, numbers, defaultNumber }: {
  leadId: string; numbers: { id: string; label: string }[]; defaultNumber: string | null;
}) {
  const [state, action, pending] = useActionState(startConversation, {});
  if (!numbers.length) return <p className="text-xs text-muted-foreground">No WhatsApp number connected yet.</p>;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="flex gap-2">
        <NativeSelect name="wa_number_id" defaultValue={defaultNumber ?? numbers[0].id} aria-label="Write from">
          {numbers.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </NativeSelect>
        <Button type="submit" size="sm" disabled={pending}>Open chat</Button>
      </div>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
