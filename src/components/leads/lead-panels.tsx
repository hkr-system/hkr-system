"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { STAGES, type LeadStage } from "@/lib/leads/constants";
import { addLeadEvent, assignOwner, changeStageForm, setNextAction } from "@/app/(app)/leads/actions";

function Msg({ error, ok }: { error?: string; ok?: boolean }) {
  if (error) return <p role="alert" className="text-xs text-destructive">{error}</p>;
  if (ok) return <p className="text-xs text-emerald-700 dark:text-emerald-400">Saved.</p>;
  return null;
}

export function StagePanel({ id, stage, lostReason }: { id: string; stage: LeadStage; lostReason: string | null }) {
  const [state, action, pending] = useActionState(changeStageForm, {});
  const [value, setValue] = useState<LeadStage>(stage);
  return (
    <form action={action} className="grid gap-2" data-testid="stage-panel">
      <input type="hidden" name="id" value={id} />
      <Label className="text-xs text-muted-foreground">Stage</Label>
      <div className="flex gap-2">
        {/* uncontrolled: React resets forms after an action; the parent keys this panel on the saved stage */}
        <NativeSelect name="stage" defaultValue={stage} onChange={(e) => setValue(e.target.value as LeadStage)}>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <Button type="submit" size="sm" disabled={pending || (value === stage && value !== "Lost")}>Move</Button>
      </div>
      {value === "Lost" ? (
        <Input name="lost_reason" placeholder="Why was it lost? (required)" defaultValue={lostReason ?? ""} required />
      ) : null}
      <Msg {...state} />
    </form>
  );
}

export function OwnerPanel({ id, owner, team }: { id: string; owner: string | null; team: { user_id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState(assignOwner, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Label className="text-xs text-muted-foreground">Owner</Label>
      <div className="flex gap-2">
        <NativeSelect name="owner_user_id" defaultValue={owner ?? ""}>
          <option value="">No owner</option>
          {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Set</Button>
      </div>
      <Msg {...state} />
    </form>
  );
}

export function NextActionPanel({ id, text, date }: { id: string; text: string | null; date: string | null }) {
  const [state, action, pending] = useActionState(setNextAction, {});
  return (
    <form action={action} className="grid gap-2" data-testid="next-action-panel">
      <input type="hidden" name="id" value={id} />
      <Label className="text-xs text-muted-foreground">Next action</Label>
      <Input name="next_action" defaultValue={text ?? ""} placeholder="e.g. Send price list on WhatsApp" />
      <div className="flex gap-2">
        <Input name="next_action_date" type="date" defaultValue={date ?? ""} className="w-44" />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
      </div>
      <Msg {...state} />
    </form>
  );
}

export function EventComposer({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addLeadEvent, {});
  const [kind, setKind] = useState<"note" | "contact">("contact");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-1 text-xs">
        <Button type="button" size="xs" variant={kind === "contact" ? "secondary" : "ghost"} onClick={() => setKind("contact")}>Log contact</Button>
        <Button type="button" size="xs" variant={kind === "note" ? "secondary" : "ghost"} onClick={() => setKind("note")}>Internal note</Button>
      </div>
      <Textarea name="body" rows={2}
        placeholder={kind === "contact" ? "e.g. Called, interested in iPhone 13/14, sending list tomorrow" : "Internal note for the team"} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>{kind === "contact" ? "Log contact" : "Add note"}</Button>
        <Msg error={state.error} />
      </div>
    </form>
  );
}
