// WhatsApp → Offers (Gabriel, Nov 24 2026): "Special Volume Deal" broadcast text from the current base list (no extra margin).
// Pure: unit-tested in offer.test.ts. The texts are Gabriel's own (EU and US / LATAM), word for word.

export type OfferRegion = "eu" | "us";
export type BaseRow = { model: string; storage_gb: number; note: string | null; price_usd: number; prev_price_usd: number | null };
export type OfferItem = { model: string; storage_gb: number; price: number; qty: string };

export const offerKey = (r: { model: string; storage_gb: number }) => `${r.model}|${r.storage_gb}`;

/** Drop in US$ per unit against the previous base (positive = cheaper now); null when the model was not in the previous base. */
export const dropOf = (r: BaseRow) => (r.prev_price_usd === null ? null : Math.round((r.prev_price_usd - r.price_usd) * 100) / 100);

/** The rows that dropped, biggest drop in US$ first (Gabriel: "en dólares"). */
export function rankDrops(rows: BaseRow[]): (BaseRow & { drop: number })[] {
  return rows.flatMap((r) => { const d = dropOf(r); return d !== null && d > 0 ? [{ ...r, drop: d }] : []; })
    .sort((a, b) => b.drop - a.drop || a.model.localeCompare(b.model) || a.storage_gb - b.storage_gb);
}

/** "€428" / "€580.79" — no decimals when the price is a whole number (as in Gabriel's offers). */
export function offerMoney(n: number, cur: "EUR" | "USD") {
  const sym = cur === "EUR" ? "€" : "$";
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `${sym}${r.toLocaleString("en-US")}` : `${sym}${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const VIDEOS_US = [
  "See our participation in Expomobile Colombia ",
  "",
  "https://www.youtube.com/watch?v=TtoWbTgLQe4",
  "https://www.youtube.com/watch?v=SlNXvM1rtQ8",
  "",
  "See our participation in Expo CE Panamá ",
  "https://www.youtube.com/watch?v=TtoWbTgLQe4",
  "",
  "See our participation in CBM Brazil 2025",
  "https://www.youtube.com/watch?v=YvvddcxhQh4",
];

/** The broadcast text. battery = what follows "+" on the battery line (e.g. "€8.6" or "$10"). */
export function offerText(region: OfferRegion, items: OfferItem[], battery: string): string {
  const eu = region === "eu";
  const cur = eu ? "EUR" : "USD";
  const lines = items.map((i) => `▪️ ${i.model} ${i.storage_gb}GB${i.qty.trim() ? ` — ${i.qty.trim()} pcs` : ""} @ *${offerMoney(i.price, cur)}*`);
  const out = [
    eu ? "*HK Refurbished Stock — Special Volume Deal 🇪🇺*" : "*HK Refurbished Stock — Special Volume Deal US*",
    "",
    '🆕 *A+++ "New Grade"* | 📲 Physical SIM',
    "━━━━━━━━━━━━━━━",
    "✅ 80%+ Battery Health",
    `🔋 New Battery 100%, 0 Cycles available — +${battery.trim()}/unit`,
    "✅ All like new",
    "✅ All colors & capacities available",
    "✅ 0 error messages or Unknown part messages",
    "✅ Up to 12 Months Warranty (1)",
    "",
    eu ? "📦 *Landed price, EU door-to-door:*" : "📦 *Landed price, US door-to-door:*",
    "",
    ...lines,
    "",
    "🧩 Take the full lot or just part of it — *minimum 50 pcs per model.*",
    "",
    "⏱️ Lead time: 12 work days (2)",
    "💳 Wire transfer",
    eu ? "🚚 Door to door price (NL/IT route)" : "🚚 Door to door price ",
    "",
    "✨ We also have *Brand New Sealed* stock available.",
  ];
  if (!eu) out.push("", ...VIDEOS_US);
  return out.join("\n");
}
