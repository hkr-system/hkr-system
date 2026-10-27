import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildLeadFields, scoreFields, type LeadInput } from "./record";
import type { ScoringConfig } from "./scoring";

type DB = SupabaseClient<Database>;
export type ImportRow = LeadInput & { notes?: unknown };

export const MAX_IMPORT_ROWS = 5000;

export type PlannedRow = {
  row: number; // 1-based line in the file (after the header)
  status: "new" | "merge" | "duplicate" | "invalid";
  company: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  problems: string[];
  existingId?: string;
  existingCompany?: string;
};

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function findExisting(db: DB, emails: string[], phones: string[]) {
  const byEmail = new Map<string, LeadRow>();
  const byPhone = new Map<string, LeadRow>();
  for (const part of chunks(emails, 300)) {
    const { data } = await db.from("leads").select("*").in("email", part);
    for (const l of data ?? []) if (l.email) byEmail.set(l.email, l);
  }
  for (const part of chunks(phones, 300)) {
    const { data } = await db.from("leads").select("*").in("phone_e164", part);
    for (const l of data ?? []) if (l.phone_e164) byPhone.set(l.phone_e164, l);
  }
  return { byEmail, byPhone };
}

// Works out, row by row, what an import would do. Nothing is written.
export async function planImport(db: DB, rows: ImportRow[]) {
  const built = rows.map((r, i) => ({ i, input: r, ...buildLeadFields(r) }));
  const emails = [...new Set(built.map((b) => b.fields.email).filter(Boolean) as string[])];
  const phones = [...new Set(built.map((b) => b.fields.phone_e164).filter(Boolean) as string[])];
  const { byEmail, byPhone } = await findExisting(db, emails, phones);

  const seen = new Set<string>();
  const plan = built.map((b) => {
    const f = b.fields;
    const base = { row: b.i + 1, company: f.company, email: f.email, phone: f.phone_e164, country: f.country, problems: b.problems };
    if (!f.company) return { ...base, status: "invalid" as const };
    const keys = [f.email && `e:${f.email}`, f.phone_e164 && `p:${f.phone_e164}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) return { ...base, status: "duplicate" as const };
    keys.forEach((k) => seen.add(k));
    const existing = (f.email && byEmail.get(f.email)) || (f.phone_e164 && byPhone.get(f.phone_e164)) || null;
    if (existing) return { ...base, status: "merge" as const, existingId: existing.id, existingCompany: existing.company };
    return { ...base, status: "new" as const };
  });
  return { plan, built, existing: { byEmail, byPhone } };
}

// Fills only the EMPTY fields of an existing lead; never overwrites team data.
function fillEmpty(existing: LeadRow, incoming: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === "") continue;
    const current = (existing as Record<string, unknown>)[k];
    if (current === null || current === undefined || current === "") patch[k] = v;
  }
  return patch;
}

export async function commitImport(db: DB, rows: ImportRow[], source: string, fileName: string, config: ScoringConfig) {
  const { plan, built, existing } = await planImport(db, rows);

  const { data: batch, error: batchError } = await db
    .from("lead_import_batches")
    .insert({ source, file_name: fileName, rows_total: rows.length })
    .select("id")
    .single();
  if (batchError || !batch) throw new Error(batchError?.message ?? "Could not start the import.");

  const toInsert = plan
    .map((p, idx) => ({ p, b: built[idx] }))
    .filter(({ p }) => p.status === "new")
    .map(({ b }) => {
      const { columns } = scoreFields(b.fields, config);
      return { ...b.fields, ...columns, source, stage: "New" as const, import_batch_id: batch.id };
    });

  let created = 0;
  const failures: string[] = [];
  for (const part of chunks(toInsert, 500)) {
    const { error, count } = await db.from("leads").insert(part, { count: "exact" });
    if (error) failures.push(error.message);
    else created += count ?? part.length;
  }

  let merged = 0;
  for (const [idx, p] of plan.entries()) {
    if (p.status !== "merge" || !p.existingId) continue;
    const b = built[idx];
    const current =
      (b.fields.email && existing.byEmail.get(b.fields.email)) || (b.fields.phone_e164 && existing.byPhone.get(b.fields.phone_e164));
    if (!current) continue;
    const patch = fillEmpty(current, b.fields);
    if (Object.keys(patch).length) {
      const { columns } = scoreFields({ ...current, ...patch }, config);
      await db.from("leads").update({ ...patch, ...columns }).eq("id", current.id);
    }
    const notes = typeof b.input.notes === "string" && b.input.notes.trim() ? `\nNotes: ${b.input.notes.trim()}` : "";
    await db.from("lead_events").insert({
      lead_id: current.id,
      kind: "import",
      body: `Found again in import "${source}" (${fileName}). ${Object.keys(patch).length ? `Filled: ${Object.keys(patch).join(", ")}.` : "Nothing new."}${notes}`,
    });
    merged++;
  }

  const skipped = plan.filter((p) => p.status === "duplicate" || p.status === "invalid").length;
  await db.from("lead_import_batches").update({ rows_created: created, rows_merged: merged, rows_skipped: skipped }).eq("id", batch.id);
  return { batchId: batch.id, created, merged, skipped, failures };
}
