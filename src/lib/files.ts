// Account files in the private Supabase Storage bucket "account-files".
// Path: <account_id>/orders/ORD-NN/<CODE>_ORD-NN_<KIND>.<ext>  (SOP §2.2–2.3 names)
//       <account_id>/general/<CODE>_<KIND>_<original>.<ext>
import type { FileKind } from "@/lib/orders/constants";

export const FILES_BUCKET = "account-files";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

function ext(name: string) {
  const e = name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return e ? `.${e}` : "";
}

function safe(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

export function sopFileName(accountCode: string, orderNumber: string | null, kind: FileKind, original: string, stamp = "") {
  const suffix = stamp ? `_${stamp}` : "";
  if (orderNumber) {
    const k = kind === "OTHER" ? safe(original.replace(/\.[^.]+$/, "")) : kind;
    return `${accountCode}_${orderNumber}_${k}${suffix}${ext(original)}`;
  }
  return `${accountCode}_${kind === "OTHER" ? "" : `${kind}_`}${safe(original.replace(/\.[^.]+$/, ""))}${suffix}${ext(original)}`;
}

export function storagePath(accountId: string, orderNumber: string | null, fileName: string) {
  return orderNumber ? `${accountId}/orders/${orderNumber}/${fileName}` : `${accountId}/general/${fileName}`;
}

// RMA documents: <account_id>/rmas/RMA-NN/<CODE>_RMA-NN_<KIND>[_<last 6 IMEI digits>][_stamp].<ext>
export function rmaFileName(rmaNumber: string, kind: FileKind, original: string, imei?: string | null, stamp = "") {
  const parts = [rmaNumber.replace(/-RMA-/, "_RMA-"), kind === "OTHER" ? safe(original.replace(/\.[^.]+$/, "")) : kind];
  if (imei) parts.push(imei.slice(-6));
  if (stamp) parts.push(stamp);
  return `${parts.join("_")}${ext(original)}`;
}

export function rmaStoragePath(accountId: string, rmaNumber: string, fileName: string) {
  return `${accountId}/rmas/RMA-${rmaNumber.split("-RMA-")[1] ?? "00"}/${fileName}`;
}
