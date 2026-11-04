"use client";

import { Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/orders/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Other charges and discounts of an order (Gabriel, Nov 4 2026): "Shipping not charged on INV-01" (+), "Discount" (−).
// Each one prints as its own line on the invoice. Optional qty × unit; otherwise one amount.
export type Charge = { description: string; qty: string; unit: string; amount: string };

const num = (s: string) => Number(String(s ?? "").replace(",", "."));
/** Amount of one charge: qty × unit when both are given, else the amount typed. */
export const chargeAmount = (c: Charge) => {
  const q = num(c.qty); const u = num(c.unit);
  return c.qty !== "" && c.unit !== "" && q > 0 && Number.isFinite(u) ? Math.round(q * u * 100) / 100 : Math.round((num(c.amount) || 0) * 100) / 100;
};
export const chargesTotal = (cs: Charge[]) => Math.round(cs.reduce((s, c) => s + chargeAmount(c), 0) * 100) / 100;

export function ChargesEditor({ charges, onChange }: { charges: Charge[]; onChange: (cs: Charge[]) => void }) {
  const set = (i: number, patch: Partial<Charge>) => onChange(charges.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="grid gap-2" data-testid="charges">
      <span className="text-sm font-medium">Other charges / discounts</span>
      {charges.map((c, i) => {
        const perUnit = c.qty !== "" || c.unit !== "";
        return (
          <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[2fr_80px_100px_110px_auto_32px] sm:items-center" data-testid="charge-row">
            <Input value={c.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="e.g. Shipping not charged on INV-01 · Discount" aria-label="Charge description" />
            <Input value={c.qty} onChange={(e) => set(i, { qty: e.target.value })} inputMode="numeric" placeholder="Qty" aria-label="Charge quantity" />
            <Input value={c.unit} onChange={(e) => set(i, { unit: e.target.value })} inputMode="decimal" placeholder="US$/unit" aria-label="Charge unit price" />
            <Input value={perUnit ? String(chargeAmount(c)) : c.amount} onChange={(e) => set(i, { amount: e.target.value })} disabled={perUnit}
              inputMode="decimal" placeholder="Amount US$" aria-label="Charge amount" />
            <span className={`text-right text-sm font-medium ${chargeAmount(c) < 0 ? "text-emerald-700" : ""}`} data-tabular>
              {chargeAmount(c) < 0 ? "Discount " : ""}{money(chargeAmount(c))}
            </span>
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove charge ${i + 1}`} onClick={() => onChange(charges.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" data-testid="add-charge" onClick={() => onChange([...charges, { description: "", qty: "", unit: "", amount: "" }])}>
          <Plus className="size-3.5" /> Add a charge
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid="add-discount" onClick={() => onChange([...charges, { description: "Discount", qty: "", unit: "", amount: "-" }])}>
          <Plus className="size-3.5" /> Add a discount
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Write a discount as a negative amount (e.g. −150). Qty × US$/unit is optional.</p>
    </div>
  );
}
