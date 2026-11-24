import { describe, expect, it } from "vitest";
import { priceChange, toPlainText, toWhatsApp, type OutMeta, type OutRow } from "./outputs";

// ▼ green / ▲ red against the previous version (Gabriel, Nov 24 2026). INVENTED prices (public repo).
const meta: OutMeta = { title: "HK Refurbished Stock · Price list", validFrom: "2026-11-25", validUntil: null, isBase: false };
const rows: OutRow[] = [
  { model: "iPhone 13 Pro", storage_gb: 128, note: null, price_usd: 300.5, prev_price: 305.6 },
  { model: "iPhone 13 Pro", storage_gb: 256, note: null, price_usd: 320, prev_price: 318 },
  { model: "iPhone 13 Pro", storage_gb: 512, note: null, price_usd: 350, prev_price: 350 },
  { model: "iPhone 14", storage_gb: 128, note: "esim+regular sim", price_usd: 280, prev_price: null },
];

describe("price change vs the previous version", () => {
  it("down, up, same, new — and no marks without a previous version", () => {
    expect(priceChange(rows[0])).toEqual({ dir: "down", diff: -5.1 });
    expect(priceChange(rows[1])).toEqual({ dir: "up", diff: 2 });
    expect(priceChange(rows[2])).toBeNull();
    expect(priceChange(rows[3])).toEqual({ dir: "new", diff: 0 });
    expect(priceChange({ ...rows[0], prev_price: undefined })).toBeNull();
  });
  it("WhatsApp: 🟢⬇️ -$ when it went down, 🔴⬆️ +$ when it went up, 🆕 for a new model", () => {
    const t = toWhatsApp(rows, meta);
    expect(t).toContain("128GB — $300.50 🟢⬇️ -$5.10");
    expect(t).toContain("256GB — $320.00 🔴⬆️ +$2.00");
    expect(t).toContain("512GB — $350.00\n");
    expect(t).toContain("128GB — $280.00 🆕");
  });
  it("plain text: ▼ -$ / ▲ +$ / new; EUR uses €", () => {
    const t = toPlainText(rows, { ...meta, currency: "EUR" });
    expect(t).toContain("128GB  €300.50 ▼ -€5.10");
    expect(t).toContain("256GB  €320.00 ▲ +€2.00");
    expect(t).toContain("128GB  €280.00 new");
  });
  it("a list without a previous version prints exactly as before", () => {
    const plain = rows.map(({ prev_price: _p, ...r }) => r);
    expect(toWhatsApp(plain, meta)).not.toMatch(/🟢|🔴|🆕/);
  });
});
