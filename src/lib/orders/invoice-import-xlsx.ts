// Reads an uploaded .xlsx into the plain grid that readInvoiceGrid() understands (first sheet; formula → its saved result;
// rich text → its text; merged cells only once). Server side (exceljs).
import ExcelJS from "exceljs";
import type { CellValue, Grid } from "./invoice-import";

function plain(v: ExcelJS.CellValue): CellValue | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return null;
  if (typeof v === "object") {
    if ("result" in v) return v.result === undefined ? undefined : plain(v.result as ExcelJS.CellValue) ?? null; // formula
    if ("formula" in v || "sharedFormula" in v) return undefined;                                            // no saved result
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
  }
  return null;
}

export async function readXlsxGrid(buffer: ArrayBuffer): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((w) => w.state === "visible") ?? wb.worksheets[0];
  const grid: Grid = {};
  if (!ws) return grid;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const v = plain(cell.value);
      if (v !== undefined && v !== null && v !== "") grid[cell.address] = v;
    });
  });
  return grid;
}
