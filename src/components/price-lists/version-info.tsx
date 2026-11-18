import Link from "next/link";
import { BRAND_LABEL } from "@/lib/brands";
import { fmtDate } from "@/lib/price-lists/outputs";
import { CHANNEL_LABEL, type ListVersionInfo } from "@/lib/price-lists/versions";

// "Price list used / sent" on an order (Overview, Invoice, Finance — Gabriel, Nov 18 2026). Amber when the prices came from a
// version the client was never sent, or when the client's current list was never sent.
export function OrderListVersions({ info, compact = false }: { info: ListVersionInfo[]; compact?: boolean }) {
  if (!info.length) return compact ? null : <p className="text-sm text-muted-foreground">No price list used: the unit prices were typed.</p>;
  return (
    <div className="grid gap-1 text-sm" data-testid="order-list-versions">
      {info.map((x) => {
        const label = BRAND_LABEL[x.brand];
        const mismatch = x.used && (!x.sent || x.sent.version !== x.used.version);
        return (
          <div key={x.brand} className={mismatch ? "text-amber-800" : ""}>
            <span className="font-medium">{label} price list</span>
            {": "}
            {x.used ? <>prices from <Link href={`/price-lists/${x.used.listId}`} className="underline">v{x.used.version}</Link>{x.used.status === "superseded" ? " (superseded)" : ""}</> : "prices typed"}
            {x.current !== null && x.used?.version !== x.current ? <> · current v{x.current}</> : null}
            {" · "}
            {x.sent ? <>sent to the client: v{x.sent.version} on {fmtDate(x.sent.sentOn)} ({CHANNEL_LABEL[x.sent.channel] ?? x.sent.channel})</> : "never marked as sent to the client"}
            {mismatch ? <span data-testid="list-version-warning"> — {x.sent ? `the client has v${x.sent.version}, the prices are from v${x.used!.version}` : "check that the client has this list"}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
