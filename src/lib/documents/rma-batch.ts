import "server-only";

// Weekly consolidated RMA shipment to Hong Kong (SOP P11, HKR_RMA_Batch_TEMPLATE.xlsx):
// sheets Shipment, Consolidated (one row per unit, only OURS) and By client.
export type BatchUnit = {
  clientCode: string; client: string; imei: string; model: string | null; storage: number | null; fault: string;
  source: "testing" | "end_customer"; rma: string; check: "OURS" | "NOT FOUND"; invoice: string | null; notes: string | null;
};
export type BatchDoc = {
  intermediary: string; cutoff: string; pickup: string | null; carrier: string; awb: string | null; boxes: number | null;
  weight: number | null; label: string | null; emailSent: string | null; recipients: string[]; units: BatchUnit[];
};

export function batchFileName(doc: Pick<BatchDoc, "intermediary" | "cutoff">, clientCode?: string) {
  const inter = doc.intermediary.replace(/[^A-Za-z0-9]+/g, "-");
  return `RMA-BATCH_${inter}_${doc.cutoff}${clientCode ? `_${clientCode}` : ""}.xlsx`;
}

export async function batchXlsx(doc: BatchDoc, onlyClient?: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const units = [...doc.units].filter((u) => !onlyClient || u.clientCode === onlyClient).sort((a, b) => a.clientCode.localeCompare(b.clientCode) || a.rma.localeCompare(b.rma));
  const bold = { bold: true };
  const head = (ws: import("exceljs").Worksheet, row: number) => {
    ws.getRow(row).font = bold;
    ws.getRow(row).eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEFF4" } }; c.border = { bottom: { style: "thin" } }; });
  };

  const sh = wb.addWorksheet("Shipment");
  sh.columns = [{ width: 40 }, { width: 48 }];
  sh.addRow(["RMA consolidated shipment — EU intermediary"]).font = { bold: true, size: 13 };
  sh.addRow([`One file per Friday cut-off. Only units verified OURS go in.${onlyClient ? ` This copy: client ${onlyClient} only.` : ""}`]);
  sh.addRow([]);
  const clients = [...new Set(units.map((u) => u.clientCode))];
  ([
    ["Intermediary", doc.intermediary], ["Cut-off date (Friday)", doc.cutoff], ["Pickup date", doc.pickup ?? ""], ["Carrier", doc.carrier],
    ["AWB", doc.awb ?? ""], ["Number of boxes", doc.boxes ?? ""], ["Total weight (kg)", doc.weight ?? ""], ["Units in shipment", units.length],
    ["Clients in shipment", clients.length], ["Units with IMEI check ≠ OURS (must be 0)", units.filter((u) => u.check !== "OURS").length],
    ["Label received (file name)", doc.label ?? ""], ["Email to HK sent (date)", doc.emailSent ?? ""], ["Email recipients", doc.recipients.join("; ")],
  ] as [string, string | number][]).forEach(([k, v]) => { const r = sh.addRow([k, v]); r.getCell(1).font = bold; });

  const cs = wb.addWorksheet("Consolidated");
  cs.columns = [6, 14, 30, 18, 16, 9, 28, 16, 20, 12, 16, 8, 30].map((width) => ({ width }));
  cs.addRow(["Consolidated — one row per unit"]).font = { bold: true, size: 12 };
  cs.addRow(["Sorted by client code. IMEI check from the IMEI master (OURS / NOT FOUND / DUPLICATE): only OURS ships."]);
  cs.addRow([]);
  cs.addRow(["#", "Client code", "Client", "IMEI", "Model", "Storage", "Fault", "Source (testing / customer)", "RMA no.", "IMEI check", "Original invoice", "Box no.", "Notes"]);
  head(cs, 4);
  units.forEach((u, i) => {
    const r = cs.addRow([i + 1, u.clientCode, u.client, u.imei, u.model ?? "", u.storage ? `${u.storage}GB` : "", u.fault,
      u.source === "testing" ? "testing" : "customer", u.rma, u.check, u.invoice ?? "", "", u.notes ?? ""]);
    r.getCell(4).numFmt = "@";
  });

  const bc = wb.addWorksheet("By client");
  bc.columns = [14, 32, 8, 22, 36, 36, 14].map((width) => ({ width }));
  bc.addRow(["By client — totals for the email and for each client's tracker"]).font = { bold: true, size: 12 };
  bc.addRow([]); bc.addRow([]);
  bc.addRow(["Client code", "Client", "Units", "RMA no.", "Models (summary)", "Faults (summary)", "Non-OURS units (must be 0)"]);
  head(bc, 4);
  const summary = (list: string[]) => Object.entries(list.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).map(([k, n]) => `${k} × ${n}`).join(", ");
  for (const code of clients) {
    const us = units.filter((u) => u.clientCode === code);
    bc.addRow([code, us[0].client, us.length, [...new Set(us.map((u) => u.rma))].join(", "),
      summary(us.map((u) => `${u.model ?? "?"}${u.storage ? ` ${u.storage}GB` : ""}`)), summary(us.map((u) => u.fault)), us.filter((u) => u.check !== "OURS").length]);
  }
  const t = bc.addRow(["Total", "", units.length, "", "", "", units.filter((u) => u.check !== "OURS").length]);
  t.font = bold;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
