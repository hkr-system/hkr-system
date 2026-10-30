"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateInvoiceIssuer } from "./actions";

export type IssuerValue = {
  company?: string; address?: string[]; phone?: string; whatsapp?: string; signer_name?: string; signer_title?: string;
  bank_lines?: string[]; usdt_lines?: string[]; stamp?: string;
};

// Company details printed on the invoices of one billing entity (header, signature, bank / USDT block, stamp).
export function InvoiceIssuerForm({ entity, label, value }: { entity: string; label: string; value: IssuerValue }) {
  const [state, action, pending] = useActionState(updateInvoiceIssuer, {});
  const [stamp, setStamp] = useState<string>("");
  const [stampError, setStampError] = useState("");
  const shown = stamp || value.stamp || "";
  const onFile = (f: File | undefined) => {
    setStampError("");
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) { setStampError("Use a PNG or JPG image."); return; }
    if (f.size > 500_000) { setStampError("Max 500 KB."); return; }
    const r = new FileReader();
    r.onload = () => setStamp(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <form action={action} className="grid gap-3 rounded-lg border p-4" data-testid={`issuer-${entity}`}>
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="stamp" value={stamp} />
      <h3 className="font-medium">{label}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>Company (exporter)</Label><Input name="company" defaultValue={value.company ?? ""} aria-label={`${label} company`} /></div>
        <div className="grid gap-1.5"><Label>Phone (Voice)</Label><Input name="phone" defaultValue={value.phone ?? ""} /></div>
        <div className="grid gap-1.5 sm:row-span-2"><Label>Address (one line each)</Label><Textarea name="address" rows={4} defaultValue={(value.address ?? []).join("\n")} /></div>
        <div className="grid gap-1.5"><Label>WhatsApp</Label><Input name="whatsapp" defaultValue={value.whatsapp ?? ""} /></div>
        <div className="grid gap-1.5"><Label>Signer name</Label><Input name="signer_name" defaultValue={value.signer_name ?? ""} /></div>
        <div className="grid gap-1.5"><Label>Signer title</Label><Input name="signer_title" defaultValue={value.signer_title ?? ""} /></div>
        <div className="grid gap-1.5"><Label>Bank details — wire payments (one line each)</Label><Textarea name="bank_lines" rows={4} defaultValue={(value.bank_lines ?? []).join("\n")} placeholder={"Account name\nAccount number | Bank\nBank address | Swift"} /></div>
        <div className="grid gap-1.5"><Label>USDT details (one line each)</Label><Textarea name="usdt_lines" rows={4} defaultValue={(value.usdt_lines ?? []).join("\n")} placeholder={"Payment: USDT TRC-20\nWallet address"} /></div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label>Company stamp (PNG/JPG, printed on approved invoices)</Label>
          <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onFile(e.target.files?.[0])} className="w-72" />
          {stampError ? <span className="text-xs text-destructive">{stampError}</span> : null}
        </div>
        {shown ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview */}
            <img src={shown} alt="Company stamp" className="size-16 rounded border object-contain" />
            {value.stamp ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="remove_stamp" /> Remove</label> : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok ? <Check className="size-4 text-emerald-600" aria-label="Saved" /> : null}
      </div>
    </form>
  );
}
