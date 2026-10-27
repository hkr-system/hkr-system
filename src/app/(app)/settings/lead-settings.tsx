"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TableCell, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { updateOwnerByMarket, updateScoringRule, updateTargetCountries, type SettingState } from "./actions";

function Status({ state }: { state: SettingState }) {
  if (state.error) return <span className="text-xs text-destructive">{state.error}</span>;
  if (state.ok) return <Check className="size-4 text-emerald-600" aria-label="Saved" />;
  return null;
}

export type RuleRow = { id: string; label: string; operator: string; value: unknown; points: number; disqualify: boolean; active: boolean };

export function ScoringRuleRow({ rule }: { rule: RuleRow }) {
  const [state, action, pending] = useActionState(updateScoringRule, {});
  const editableValue = rule.operator !== "in_setting";
  return (
    <TableRow data-testid={`rule-${rule.label}`}>
      <TableCell className="align-top font-medium whitespace-normal">
        {rule.label}
        <span className="block text-xs font-normal text-muted-foreground">
          {rule.disqualify ? "Disqualifies the lead" : rule.operator === "in_setting" ? "Country list below" : `Rule: ${rule.operator}`}
        </span>
      </TableCell>
      <TableCell colSpan={3}>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={rule.id} />
          {!rule.disqualify ? (
            <Input name="points" type="number" min={0} max={100} defaultValue={rule.points} className="w-20" aria-label="Points" />
          ) : <input type="hidden" name="points" value={rule.points} />}
          {editableValue ? (
            <Input name="value" defaultValue={JSON.stringify(rule.value)} className="w-64 font-mono text-xs" aria-label="Value" />
          ) : null}
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="active" defaultChecked={rule.active} className="size-4" /> Active
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
          <Status state={state} />
        </form>
      </TableCell>
    </TableRow>
  );
}

export function TargetCountriesForm({ codes, names }: { codes: string[]; names: string[] }) {
  const [state, action, pending] = useActionState(updateTargetCountries, {});
  return (
    <form action={action} className="grid gap-2" data-testid="target-countries">
      <Textarea name="countries" rows={2} defaultValue={codes.join(", ")} placeholder="e.g. NL, DE, ES, MX" />
      <p className="text-xs text-muted-foreground">
        {codes.length ? `Now: ${names.join(", ")}` : "Empty: no lead gets the target-country points."} Separate with commas; names or 2-letter codes.
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Save countries</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function OwnerByMarketForm({ value, team }: { value: Record<string, string | null>; team: { user_id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState(updateOwnerByMarket, {});
  return (
    <form action={action} className="grid gap-3" data-testid="owner-by-market">
      <div className="grid gap-3 sm:grid-cols-4">
        {["EU", "LATAM", "US", "ROW"].map((m) => (
          <label key={m} className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">{m}</span>
            <NativeSelect name={m} defaultValue={value[m] ?? ""}>
              <option value="">No automatic owner</option>
              {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
            </NativeSelect>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Save owners</Button>
        <Status state={state} />
      </div>
    </form>
  );
}
