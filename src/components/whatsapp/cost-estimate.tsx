import type { CostEstimate } from "@/lib/whatsapp/pricing";

// Estimated Meta cost of a broadcast: total + a line per market (recipients × list price).
// Pure display: used in the "New broadcast" form (client) and on the broadcast page (server).

const money = (n: number, digits = 2) =>
  `US$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function asOfLabel(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)));
}

export function CostEstimateView({ cost, title = "Estimated cost" }: { cost: CostEstimate; title?: string }) {
  if (!cost.recipients) return null;
  const asOf = asOfLabel(cost.asOf);
  return (
    <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid="cost-estimate">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-lg font-semibold tabular-nums" data-testid="cost-total">≈ {money(cost.total)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr><th className="py-1 pr-3 text-left font-normal">Market</th><th className="py-1 pr-3 text-right font-normal">Recipients</th>
              <th className="py-1 pr-3 text-right font-normal">Price / message</th><th className="py-1 text-right font-normal">Subtotal</th></tr>
          </thead>
          <tbody>
            {cost.lines.map((l) => (
              <tr key={l.market} className="border-t">
                <td className="py-1 pr-3">{l.label}</td>
                <td className="py-1 pr-3 text-right">{l.recipients}</td>
                <td className="py-1 pr-3 text-right">{l.rate === null ? "no price" : money(l.rate, 4)}</td>
                <td className="py-1 text-right">{money(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cost.missingRates.length ? (
        <p className="text-xs text-amber-700">No price saved for {cost.missingRates.join(", ")}: not included. Add it in Settings → WhatsApp message prices.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Meta list prices{asOf ? ` as of ${asOf}` : ""}; Meta charges only delivered messages and may add taxes. Replies from clients are free.
      </p>
    </div>
  );
}
