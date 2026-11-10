"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readXlsxGrid } from "@/lib/orders/invoice-import-xlsx";
import { planImport, readInvoiceGrid, type ImportPlan, type ImportedInvoice } from "@/lib/orders/invoice-import";
import { loadTerms } from "@/lib/orders/service";
import { countryOptions } from "@/lib/leads/countries";

export type ReadInvoiceResult = {
  error?: string;
  invoice?: ImportedInvoice; plan?: ImportPlan;
  intermediaryId?: string;          // "" = direct (the consignee is the client itself)
  addressId?: string;               // a saved address of the client that matches the Ship-to block
  shipTo?: Record<string, string>;  // otherwise the Ship-to block for "+ New address…"
  notes?: string[];
};

// company names compared without punctuation and legal forms: "Global Connect B.V." = "Global Connect BV" = "global connect"
const norm = (s: string | null | undefined) => ` ${(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ")} `
  .replace(/ (b ?v|s ?r ?l|s ?l|s ?a|ltd|llc|inc|gmbh|limited|co|sas|spa|s ?p ?a) /g, " ").replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length >= 4 && y.startsWith(x)) || (y.length >= 4 && x.startsWith(y))); };

// Import an invoice made in Excel (Gabriel, Nov 9 2026): read it and propose the order; nothing is saved here.
export async function readInvoiceExcel(fd: FormData): Promise<ReadInvoiceResult> {
  await requireRole(["admin", "account_specialist"]);
  const file = fd.get("file");
  const accountId = String(fd.get("account_id") ?? "");
  if (!accountId) return { error: "Choose the client first." };
  if (!(file instanceof File) || !file.size) return { error: "Choose the invoice file (.xlsx)." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Only Excel files (.xlsx) can be read. Save the invoice as .xlsx and try again." };
  if (file.size > 3.5 * 1024 * 1024) return { error: "The file is larger than 3.5 MB." };
  let invoice: ImportedInvoice;
  try { invoice = readInvoiceGrid(await readXlsxGrid(await file.arrayBuffer())); }
  catch { return { error: "The file could not be read as an Excel workbook." }; }
  if (!invoice.products.length) return { error: invoice.problems.join(" ") || "No product lines found.", invoice };

  const db = await createClient();
  const [terms, { data: acc }, { data: companies }, { data: addresses }] = await Promise.all([
    loadTerms(db),
    db.from("accounts").select("name, legal_name").eq("id", accountId).maybeSingle(),
    db.from("intermediaries").select("id, name"),
    db.from("account_addresses").select("id, label, company").eq("account_id", accountId).eq("archived", false),
  ]);
  if (!acc) return { error: "You do not have access to this client." };
  const plan = planImport(invoice, terms.usdtFeePct, terms.depositPct);
  const notes: string[] = [];

  // route: the Ultimate consignee is the client itself (direct) or one of the intermediaries / clearance companies
  const consignee = invoice.consignee[0] ?? "";
  let intermediaryId: string | undefined;
  if (consignee && (same(consignee, acc.legal_name ?? "") || same(consignee, acc.name))) intermediaryId = "";
  else {
    const hit = (companies ?? []).find((c) => same(consignee, c.name));
    if (hit) intermediaryId = hit.id;
    else if (consignee) notes.push(`The Ultimate consignee “${consignee}” is not the client nor a company in Settings → Intermediaries & clearance: the route stays Direct — add the company there (with its VAT) and pick it.`);
  }
  // ship to: a saved address of the client, else the Excel's block for a new one
  const shipName = invoice.shipTo[0] ?? "";
  const addr = (addresses ?? []).find((a) => same(shipName, a.company ?? "") || same(shipName, a.label));
  let shipTo: Record<string, string> | undefined;
  if (!addr && invoice.shipTo.length) {
    const lines = invoice.shipTo.slice(1);
    const countries = countryOptions("en");
    const byName = (l: string) => countries.find((c) => norm(l) === norm(c.name) || norm(l) === norm(`the ${c.name}`) || norm(l).endsWith(` ${norm(c.name)}`));
    const ci = lines.findIndex((l) => byName(l));
    const phone = lines.find((l) => /^\+?[\d\s()-]{7,}$/.test(l)) ?? "";
    const email = lines.find((l) => /@/.test(l)) ?? "";
    const rest = lines.filter((l, i) => i !== ci && l !== phone && l !== email);
    shipTo = {
      name: shipName, address: rest.slice(0, -1).join(", ") || rest[0] || "", city: rest.length > 1 ? rest[rest.length - 1] : "",
      country: ci >= 0 ? byName(lines[ci])!.code : "", phone: phone || invoice.notify.phone, email: email || invoice.notify.email,
      contact: /[a-z]/i.test(invoice.notify.contact) ? invoice.notify.contact : "",
    };
  }
  return { invoice, plan, intermediaryId, addressId: addr?.id, shipTo, notes: [...plan.notes, ...notes] };
}
