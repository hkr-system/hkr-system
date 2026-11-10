// Invoice address blocks (Gabriel, Nov 9 2026). Pure, unit-tested.
import { countryName } from "@/lib/leads/countries";

export type InvoicedCompany = { name: string; address: string | null; country: string | null; rsin: string | null; eori: string | null; kvk: string | null; vat: string | null };
const lines = (t: string | null | undefined) => (t ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** The invoiced company's block: name, address lines, country (unless the address already ends with it), then only the
 *  identifiers it has — RSIN, EORI, KVK/CoC, VAT, in the order of HKR's Telcos invoice. */
export function companyLines(im: InvoicedCompany): string[] {
  const addr = lines(im.address);
  const country = im.country ? countryName(im.country) : "";
  const last = (addr[addr.length - 1] ?? "").toLowerCase();
  const withCountry = country && !last.includes(country.toLowerCase()) && !last.includes(im.country!.toLowerCase() + " ") ? [country] : [];
  return [im.name, ...addr, ...withCountry,
    im.rsin ? `RSIN: ${im.rsin}` : "", im.eori ? `EORI: ${im.eori}` : "", im.kvk ? `KVK/CoC: ${im.kvk}` : "", im.vat ? `VAT: ${im.vat}` : ""]
    .filter(Boolean);
}

