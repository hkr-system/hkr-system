"use client";

import { useActionState, useTransition } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import { addSkus, setSkuBatteryEligible, updateUserAccess } from "./actions";

export function UserAccessRow({ u, isMe }: {
  u: { user_id: string; full_name: string | null; email: string | null; role: string | null; timezone: string; active: boolean }; isMe: boolean;
}) {
  const [state, action, pending] = useActionState(updateUserAccess, {});
  return (
    <TableRow data-testid={`user-${u.email}`}>
      <TableCell colSpan={2}>
        <span className="text-sm">{u.email}</span>{isMe ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
      </TableCell>
      <TableCell colSpan={3}>
        {/* key: after Save, React resets the form to its first values; a new key redraws it with the saved values */}
        <form key={`${u.full_name ?? ""}-${u.role ?? ""}-${u.active}`} action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="user_id" value={u.user_id} />
          <Input name="full_name" defaultValue={u.full_name ?? ""} placeholder="Full name" maxLength={80} className="h-8 w-44" aria-label={`Name of ${u.email}`} />
          <NativeSelect name="role" defaultValue={u.role ?? ""} className="w-44" aria-label={`Role of ${u.email}`} disabled={isMe}>
            <option value="">No role (no access)</option>
            <option value="admin">Admin</option>
            <option value="bd">Business development</option>
            <option value="account_specialist">Account specialist</option>
          </NativeSelect>
          {isMe ? <input type="hidden" name="role" value="admin" /> : null}
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} disabled={isMe} className="size-4" /> Active</label>
          {isMe ? <input type="hidden" name="active" value="on" /> : null}
          <span className="text-xs text-muted-foreground">{u.timezone}</span>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Save"}</Button>
          {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
          {state.ok ? <Check className="size-4 text-emerald-600" aria-label="Saved" /> : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

export function SkuAddForm() {
  const [state, action, pending] = useActionState(addSkus, {});
  return (
    <form action={action} className="grid gap-2">
      <Label htmlFor="skus">Add SKUs — one per line: model, storage GB, colour (grade A+++ unless you add a 4th value)</Label>
      <Textarea id="skus" name="skus" rows={4} placeholder={"iPhone 14 Pro, 256, Deep Purple\niPhone 15, 128, Black\niPhone 16 Pro Max, 256, Desert Titanium"} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add SKUs"}</Button>
        <span className="text-xs text-muted-foreground">iPhone 16 models are created without the separate battery line. Existing SKUs are skipped.</span>
        {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state.ok ? <Check className="size-4 text-emerald-600" aria-label="Saved" /> : null}
      </div>
    </form>
  );
}

export function SkuBatteryToggle({ id, eligible }: { id: string; eligible: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <input type="checkbox" className="size-4" defaultChecked={eligible} disabled={pending}
        onChange={(e) => start(async () => { await setSkuBatteryEligible(id, e.target.checked); })} />
      Eligible
    </label>
  );
}
