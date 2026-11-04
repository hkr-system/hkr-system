"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { parseSheetRows, modelKey, type ParsedRow } from "@/lib/price-lists/models";
import { applyCombined, extraDecision, rmaDecision, type EngineInputs } from "@/lib/price-lists/engine";
import { listFileBase, toXlsx } from "@/lib/price-lists/outputs";
import { toPdf } from "@/lib/price-lists/outputs-pdf";
import { loadEngineParams, loadListDoc, loadLogo } from "@/lib/price-lists/service";

export type PlState = { ok?: boolean; error?: string; message?: string };
export type ParseState = PlState & { rows?: (ParsedRow & { hasSku: boolean })[]; problems?: string[]; fileName?: string };

const PREPARERS = ["admin", "account_specialist"] as const;

function friendly(e: { code?: string; message: string }) {
  if (e.code === "42501" && !/admin|approved|rails|base/i.test(e.message)) return "You do not have access to do this.";
  return e.message;
}
function refresh(accountId?: string | null, listId?: string) {
  revalidatePath("/price-lists");
  if (listId) revalidatePath(`/price-lists/${listId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

// ---------------------------------------------------------------------------
// Base list (admin): read the iPhonePrices xlsx → preview → save as a new version
// ---------------------------------------------------------------------------
export async function parseBaseFile(_p: ParseState, fd: FormData): Promise<ParseState> {
  await requireRole(["admin"]);
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the xlsx file first." };
  if (file.size > 2_000_000) return { error: "The file is larger than 2 MB." };
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer); }
  catch { return { error: "The file could not be read. Save it as .xlsx and try again." }; }
  const ws = wb.worksheets[0];
  if (!ws) return { error: "The file has no sheet." };
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (r) => {
    rows.push([1, 2, 3].map((i) => {
      const v = r.getCell(i).value as unknown;
      if (v && typeof v === "object" && "result" in (v as object)) return (v as { result: unknown }).result;
      if (v && typeof v === "object" && "richText" in (v as object)) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
      return v;
    }));
  });
  const parsed = parseSheetRows(rows);
  const db = await createClient();
  const { data: skus } = await db.from("skus").select("model, storage_gb");
  const have = new Set((skus ?? []).map((s) => modelKey(s.model, s.storage_gb)));
  return { ok: true, fileName: file.name, problems: parsed.problems, rows: parsed.rows.map((r) => ({ ...r, hasSku: have.has(modelKey(r.model, r.storage_gb)) })) };
}

type BaseRowInput = { model: string; storage_gb: number; note: string | null; price: number };

export async function saveBaseList(rowsJson: string, sourceFile: string | null, validFrom: string | null): Promise<PlState> {
  await requireRole(["admin"]);
  let rows: BaseRowInput[];
  try { rows = JSON.parse(rowsJson); } catch { return { error: "The prices could not be read." }; }
  rows = (Array.isArray(rows) ? rows : []).map((r) => ({
    model: String(r.model ?? "").trim(), storage_gb: Math.round(Number(r.storage_gb)), note: r.note ? String(r.note).trim() : null,
    price: Math.round(Number(r.price) * 100) / 100,
  })).filter((r) => r.model);
  if (!rows.length) return { error: "There are no prices to save." };
  const bad = rows.find((r) => !(r.storage_gb > 0) || !(r.price > 0));
  if (bad) return { error: `${bad.model}: GB and price must be numbers above 0.` };
  const keys = new Set<string>();
  for (const r of rows) { const k = modelKey(r.model, r.storage_gb); if (keys.has(k)) return { error: `${r.model} ${r.storage_gb}GB appears twice.` }; keys.add(k); }

  const db = await createClient();
  const { data: list, error } = await db.from("price_lists")
    .insert({ account_id: null, source_file: sourceFile, valid_from: validFrom || new Date().toISOString().slice(0, 10) })
    .select("id, version").single();
  if (error) return { error: friendly(error) };
  const { error: re } = await db.from("price_list_rows").insert(rows.map((r, i) => ({
    price_list_id: list.id, model: r.model, storage_gb: r.storage_gb, note: r.note, price_usd: r.price, sort_order: i,
  })));
  if (re) { await db.from("price_lists").delete().eq("id", list.id); return { error: friendly(re) }; }
  const { error: ae } = await db.from("price_lists").update({ status: "approved" }).eq("id", list.id);
  if (ae) return { error: friendly(ae) };
  refresh(null, list.id);
  redirect(`/price-lists/${list.id}`);
}

// ---------------------------------------------------------------------------
// Client lists
// ---------------------------------------------------------------------------
export async function prepareList(accountId: string): Promise<PlState> {
  const user = await requireRole(PREPARERS);
  const db = await createClient();
  const [{ data: inputs, error: ie }, params] = await Promise.all([
    db.rpc("price_engine_inputs", { p_account: accountId }), loadEngineParams(db),
  ]);
  if (ie) return { error: friendly(ie) };
  const i = inputs as unknown as EngineInputs;
  const rma = rmaDecision(i, params);
  const extra = extraDecision(i, params);
  const applied = applyCombined(rma.value, extra.value, params);
  const engine = {
    at: new Date().toISOString(), by: user.id, inputs: i,
    params: { rmaFloor: params.rmaFloor, rmaDefault: params.rmaDefault, rmaCap: params.rmaCap, extraStep: params.extraStep, extraMax: params.extraMax, combinedMax: params.combinedMax },
    rma: { value: rma.value, case: rma.case, ratio: rma.ratio, cost: rma.cost, lines: rma.lines },
    extra: { value: extra.value, case: extra.case, score: extra.score, signals: extra.signals, lines: extra.lines },
    trimmed: applied.extra !== extra.value,
  };
  const { data: id, error } = await db.rpc("price_list_create_draft", {
    p_account: accountId, p_rma: applied.rma, p_extra: applied.extra, p_engine: engine as never,
  });
  if (error) return { error: friendly(error) };
  refresh(accountId, id as string);
  redirect(`/price-lists/${id}`);
}

export async function setPercentages(_p: PlState, fd: FormData): Promise<PlState> {
  await requireRole(["admin"]);
  const id = String(fd.get("id") ?? "");
  const rma = Number(String(fd.get("rma_c") ?? "").replace(",", "."));
  const extra = Number(String(fd.get("extra_c") ?? "").replace(",", "."));
  if (!Number.isFinite(rma) || !Number.isFinite(extra) || rma < 0 || extra < 0) return { error: "Write both percentages as numbers (e.g. 1.25)." };
  if (rma + extra > 10) return { error: "RMA_c + Extra_c above 10 % looks like a typing mistake." };
  const db = await createClient();
  const { error } = await db.rpc("price_list_set_percentages", { p_list: id, p_rma: rma, p_extra: extra, p_note: String(fd.get("note") ?? "") || undefined });
  if (error) return { error: friendly(error) };
  const { data } = await db.from("price_lists").select("account_id").eq("id", id).maybeSingle();
  refresh(data?.account_id, id);
  return { ok: true, message: "Prices recalculated with your percentages." };
}

export async function removeRow(rowId: string, listId: string): Promise<PlState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const { error } = await db.from("price_list_rows").delete().eq("id", rowId).eq("price_list_id", listId);
  if (error) return { error: friendly(error) };
  refresh(null, listId);
  return { ok: true };
}

export async function deleteDraft(listId: string): Promise<PlState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const { data, error } = await db.from("price_lists").delete().eq("id", listId).eq("status", "draft").select("account_id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "Only a draft can be deleted." };
  refresh(data.account_id);
  redirect(data.account_id ? `/accounts/${data.account_id}?tab=price-lists` : "/price-lists");
}

// Approve (admin): the previous version is superseded; the Excel and PDF are filed as [code]_PL_yyyy-mm-dd (SOP P7).
export async function approveList(listId: string): Promise<PlState> {
  await requireRole(["admin"]);
  const db = await createClient();
  const { data: l, error } = await db.from("price_lists").update({ status: "approved" }).eq("id", listId).eq("status", "draft")
    .select("account_id, valid_from").maybeSingle();
  if (error) return { error: friendly(error) };
  if (!l) return { error: "Only a draft can be approved." };
  if (!l.account_id) { refresh(null, listId); return { ok: true, message: "Approved." }; }

  const doc = await loadListDoc(db, listId);
  if (!doc) return { ok: true, message: "Approved." };
  const base = listFileBase(doc.code, l.valid_from);
  const [xlsx, pdf] = await Promise.all([toXlsx(doc.rows, doc.meta), loadLogo().then((logo) => toPdf(doc.rows, doc.meta, logo))]);
  for (const [ext, body, mime] of [["xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ["pdf", pdf, "application/pdf"]] as const) {
    const path = `${l.account_id}/pricelists/${base}.${ext}`;
    const { error: ue } = await db.storage.from(FILES_BUCKET).upload(path, body, { contentType: mime, upsert: true });
    if (ue) return { ok: true, message: `Approved, but the ${ext} could not be filed: ${ue.message}` };
    const { data: existing } = await db.from("files").select("id").eq("storage_path", path).maybeSingle();
    if (!existing) {
      await db.from("files").insert({
        account_id: l.account_id, owner_table: "price_lists", owner_id: listId, kind: "PL",
        storage_path: path, file_name: `${base}.${ext}`, mime_type: mime, size_bytes: body.length,
      });
    }
  }
  refresh(l.account_id, listId);
  return { ok: true, message: `Approved. ${base}.xlsx and .pdf are in the account files; the client sees the prices in the portal.` };
}

// ---------------------------------------------------------------------------
// Adjusted prices on a draft client list (Gabriel, Nov 3 2026). The database stamps who/when, keeps the engine price and
// refuses a specialist's price below the floor (SOP 5.5: below the floor the SD decides).
// ---------------------------------------------------------------------------
export async function savePrices(listId: string, changes: { id: string; price: number }[]): Promise<PlState> {
  await requireRole(PREPARERS);
  const db = await createClient();
  const { data: l } = await db.from("price_lists").select("account_id, status").eq("id", listId).maybeSingle();
  if (!l || !l.account_id) return { error: "Price list not found." };
  if (l.status !== "draft") return { error: "Only a draft can be changed: prepare a new list." };
  let n = 0;
  for (const c of changes) {
    if (!(c.price >= 0)) return { error: "Every price must be a number." };
    const { error } = await db.from("price_list_rows").update({ price_usd: Math.round(c.price * 100) / 100 }).eq("id", c.id).eq("price_list_id", listId);
    if (error) return { error: friendly(error), message: n ? `${n} prices saved before the error.` : undefined };
    n++;
  }
  refresh(l.account_id, listId);
  return { ok: true, message: n ? `${n} price${n === 1 ? "" : "s"} saved.` : "Nothing changed." };
}
