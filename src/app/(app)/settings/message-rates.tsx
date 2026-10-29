"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateMessageRates } from "./actions";

type Rates = { as_of?: string; rates?: Record<string, Partial<Record<"marketing" | "utility" | "authentication", number>>> };
const CATS = ["marketing", "utility", "authentication"] as const;

// Meta's price per delivered template message, per market (USD). Used for the broadcast cost estimate.
export function MessageRatesForm({ value, markets }: { value: Rates | null; markets: { code: string; label: string }[] }) {
  const [state, action, pending] = useActionState(updateMessageRates, {});
  const fmt = (n: number | undefined) => (typeof n === "number" ? String(n) : "");
  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="as_of">Prices checked on</Label>
          <Input id="as_of" type="date" name="as_of" defaultValue={value?.as_of ?? ""} className="w-44" required />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save prices"}</Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok ? <Check className="size-4 text-emerald-600" aria-label="Saved" /> : null}
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>Market</TableHead>
              <TableHead className="text-right">Marketing</TableHead>
              <TableHead className="text-right">Utility</TableHead>
              <TableHead className="text-right">Authentication</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markets.map((m) => (
              <TableRow key={m.code}>
                <TableCell className="font-medium">{m.label}</TableCell>
                {CATS.map((c) => (
                  <TableCell key={c} className="text-right">
                    <Input name={`rate_${m.code}_${c}`} defaultValue={fmt(value?.rates?.[m.code]?.[c])} inputMode="decimal"
                      aria-label={`${m.label} ${c}`} className="ml-auto h-8 w-24 text-right tabular-nums" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </form>
  );
}
