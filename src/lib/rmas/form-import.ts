// Reads the client's "RMA Request Form" xlsx (HKR_RMA_Request_Form_TEMPLATE, sheet "RMA Form"):
// client block in rows 6–10 (labels in A/G, values in C/H), units from the row whose first
// header is "#" / "IMEI…". Pure and unit-tested: it takes the sheet as rows of cells.
import { luhnValid } from "@/lib/orders/imei";
import { FAULT_CATEGORIES } from "./constants";

export type FormUnit = {
  row: number;
  imei: string;
  model: string | null;
  storage_gb: number | null;
  color: string | null;
  fault_category: string;
  fault_text: string | null;
  source: "testing" | "end_customer";
  detected_on: string | null;
  battery_swollen: boolean;
  physical_damage: boolean;
  evidence_names: string | null;
};
export type FormParse = {
  header: { company: string | null; contact: string | null; contactInfo: string | null; orderRefs: string | null;
            location: "with_client" | "at_intermediary" | "at_end_customer" | null };
  units: FormUnit[];
  problems: string[];   // lines skipped or corrected, in plain words
};

const FORM_LABELS = ["company name", "contact person", "email whatsapp", "order invoice number", "units in this form",
  "client code", "rma number", "date submitted", "delivery date", "where are the units now"];

type Cell = string | number | boolean | Date | null | undefined;

const text = (c: Cell) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim());
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function yes(c: Cell) {
  const t = norm(text(c));
  return t === "yes" || t === "y" || t === "si" || t === "true" || c === true;
}

function toDate(c: Cell): string | null {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (typeof c === "number" && c > 30000 && c < 80000) {
    // Excel serial date
    return new Date(Date.UTC(1899, 11, 30) + c * 86400_000).toISOString().slice(0, 10);
  }
  const t = text(c);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; // day/month/year
  return null;
}

function imeiOf(c: Cell): string {
  if (typeof c === "number") return Math.round(c).toString();
  return text(c).replace(/\D/g, "");
}

function faultOf(c: Cell): string | null {
  const t = norm(text(c));
  if (!t) return null;
  return FAULT_CATEGORIES.find((f) => norm(f) === t) ?? null;
}

function locationOf(c: Cell): FormParse["header"]["location"] {
  const t = norm(text(c));
  if (t.includes("intermediary")) return "at_intermediary";
  if (t.includes("end customer")) return "at_end_customer";
  if (t.includes("client")) return "with_client";
  return null;
}

export function parseRmaForm(rows: Cell[][]): FormParse {
  const out: FormParse = {
    header: { company: null, contact: null, contactInfo: null, orderRefs: null, location: null },
    units: [], problems: [],
  };
  const labelValue = (label: string) => {
    for (const r of rows.slice(0, 15)) {
      for (let i = 0; i < r.length; i++) {
        if (norm(text(r[i])).startsWith(label)) {
          // the value sits right of the label, before the next label of the same row
          for (const x of r.slice(i + 1)) {
            if (FORM_LABELS.some((l) => norm(text(x)).startsWith(l))) return null;
            if (text(x) !== "") return x;
          }
          return null;
        }
      }
    }
    return null;
  };
  out.header.company = text(labelValue("company name")) || null;
  out.header.contact = text(labelValue("contact person")) || null;
  out.header.contactInfo = text(labelValue("email whatsapp")) || null;
  out.header.orderRefs = text(labelValue("order invoice number")) || null;
  out.header.location = locationOf(labelValue("where are the units now"));

  const headerIdx = rows.findIndex((r) => r.some((c) => norm(text(c)).startsWith("imei")) && r.some((c) => norm(text(c)).startsWith("fault")));
  if (headerIdx < 0) {
    out.problems.push("This file does not look like the RMA Request Form (no IMEI / Fault columns found).");
    return out;
  }
  const head = rows[headerIdx].map((c) => norm(text(c)));
  const col = (start: string) => head.findIndex((h) => h.startsWith(start));
  const c = {
    imei: col("imei 15"), model: col("model"), storage: col("storage"), color: col("color"),
    cat: col("fault category"), desc: col("fault description"), source: col("source"), date: col("date detected"),
    swollen: col("battery swollen"), damage: col("physical"), evidence: col("evidence"),
  };
  if (c.imei < 0) c.imei = col("imei");
  const seen = new Set<string>();
  rows.slice(headerIdx + 1).forEach((r, k) => {
    const rowNo = headerIdx + 2 + k;
    const raw = r[c.imei];
    if (text(raw) === "") return;
    const imei = imeiOf(raw);
    if (!/^\d{15}$/.test(imei)) {
      out.problems.push(`Row ${rowNo}: IMEI "${text(raw)}" does not have 15 digits — skipped.`);
      return;
    }
    if (seen.has(imei)) {
      out.problems.push(`Row ${rowNo}: IMEI ${imei} is repeated in the form (DUPLICATE) — skipped.`);
      return;
    }
    seen.add(imei);
    if (!luhnValid(imei)) out.problems.push(`Row ${rowNo}: IMEI ${imei} fails the check digit — please re-check it with the client.`);
    let cat = faultOf(r[c.cat]);
    if (!cat) {
      if (text(r[c.cat])) out.problems.push(`Row ${rowNo}: fault category "${text(r[c.cat])}" is not in the list — set to "Other".`);
      cat = "Other";
    }
    const storage = Number(text(r[c.storage]).replace(/[^0-9]/g, "")) || null;
    out.units.push({
      row: rowNo, imei,
      model: text(r[c.model]) || null, storage_gb: storage, color: text(r[c.color]) || null,
      fault_category: cat, fault_text: text(r[c.desc]) || null,
      source: norm(text(r[c.source])).includes("customer") ? "end_customer" : "testing",
      detected_on: toDate(r[c.date]),
      battery_swollen: yes(r[c.swollen]), physical_damage: yes(r[c.damage]),
      evidence_names: c.evidence >= 0 ? text(r[c.evidence]) || null : null,
    });
  });
  if (!out.units.length) out.problems.push("No units found in the form.");
  return out;
}
