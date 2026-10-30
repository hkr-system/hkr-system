import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtDay, fmtMoney, showStamp, type InvoiceDoc } from "./invoice";
import { invoiceTitle } from "./invoice-lines";

// PDF in the layout of the reference commercial invoices (what the client receives).
const ink = "#0f1a33";
const s = StyleSheet.create({
  page: { padding: 30, fontFamily: "Times-Roman", fontSize: 8, color: ink },
  title: { fontFamily: "Times-Bold", fontSize: 15, textAlign: "center", marginBottom: 8 },
  draft: { color: "#d6192e" },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  label: { fontFamily: "Times-Bold" },
  block: { marginBottom: 8 },
  table: { borderWidth: 0.6, borderColor: ink, marginTop: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: ink },
  th: { fontFamily: "Times-Bold", textAlign: "center", padding: 3, borderRightWidth: 0.6, borderColor: ink },
  td: { padding: 3, borderRightWidth: 0.6, borderColor: ink },
  pay: { paddingHorizontal: 3, paddingVertical: 1 },
  notes: { marginTop: 10, fontSize: 7 },
  sign: { flexDirection: "row", gap: 12, marginTop: 16 },
});
const W = { n: "7%", d: "49%", m: "8%", q: "9%", u: "12%", t: "15%" };

function Lines({ items }: { items: string[] }) {
  return <>{items.map((l, i) => <Text key={i} style={i === 0 ? s.label : undefined}>{l}</Text>)}</>;
}

function InvoicePdf({ doc }: { doc: InvoiceDoc }) {
  const t = doc.texts;
  const exporter = [doc.issuer.company, ...(doc.issuer.address ?? []), doc.issuer.phone].filter(Boolean) as string[];
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt attribute
  const stamp = showStamp(doc) && doc.issuer.stamp ? <Image src={doc.issuer.stamp} style={{ width: 72, height: 70, marginTop: 4 }} /> : null;
  let n = 0;
  return (
    <Document title={`Invoice ${doc.number}`} author={doc.issuer.company ?? "HK Refurbished Stock"}>
      <Page size="A4" style={s.page}>
        <Text style={[s.title, doc.status === "draft" ? s.draft : {}]}>{invoiceTitle(doc.status)}</Text>
        <View style={[s.row, s.block]}>
          <View style={s.col}><Text style={s.label}>Export References:</Text><Text>{t.export_reference ?? "Export Invoice of Electronics Products"}</Text></View>
          <View style={{ width: 160 }}><Text style={[s.label, { textAlign: "right", fontSize: 9 }]}>Invoice No: {doc.number}</Text></View>
        </View>
        <View style={[s.row, s.block]}>
          <View style={s.col}><Text style={s.label}>Exporter Name and Address:</Text>{exporter.length ? <Lines items={exporter} /> : <Text>(set the issuer in Settings → Invoices)</Text>}</View>
          <View style={s.col}><Text style={s.label}>Ultimate Consignee Name and Address:</Text><Lines items={doc.consignee} /></View>
          <View style={s.col}><Text style={s.label}>Ship To Name and Address:</Text><Lines items={doc.shipTo} /></View>
        </View>
        <View style={[s.row, s.block]}>
          <View style={s.col} />
          <View style={s.col}>
            <Text style={s.label}>Notify Party Name and Address:</Text>
            <Text><Text style={s.label}>Contact: </Text>{doc.notify.contact ?? ""}</Text>
            <Text><Text style={s.label}>Address: </Text>{doc.notify.address ?? ""}</Text>
            <Text><Text style={s.label}>Phone: </Text>{doc.notify.phone ?? ""}</Text>
          </View>
          <View style={s.col}>
            <Text>{fmtDay(doc.date)}</Text>
            <Text>Shippment Reference: {doc.shipment.reference || "N/A"}</Text>
            <Text>Air Way Bill Number: {doc.shipment.awb || "N/A"}</Text>
            <Text>Country of consignation: {doc.shipment.country ?? ""}</Text>
            <Text>Airport of Consignation: {doc.shipment.airport ?? ""}</Text>
          </View>
        </View>
        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>Condition of Sale and Terms of Payment:</Text>
            <Text><Text style={s.label}>Freight: </Text>{t.freight ?? "FOB HK"}</Text>
            <Text><Text style={s.label}>Payment Terms: </Text>{t.payment_terms ?? "Pre-payment"}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Transportation:</Text>
            <Text><Text style={s.label}>Via: </Text>{t.via ?? "FEDEX/DHL Express"}</Text>
            <Text><Text style={s.label}>From: </Text>{t.from ?? "Hong Kong"}</Text>
          </View>
          <View style={s.col}>
            <Text><Text style={s.label}>Total Number of Packages: </Text>{t.packages ?? "1"}</Text>
            <Text><Text style={s.label}>Total Net Weight (kgs): </Text>{t.net_kg ?? "N/A"}</Text>
            <Text><Text style={s.label}>Total Gross Weight (kgs): </Text>{t.gross_kg ?? "N/A"}</Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, { width: W.n }]}>Line #</Text>
            <Text style={[s.th, { width: W.d }]}>Harmonized Number, Product Description</Text>
            <Text style={[s.th, { width: W.m }]}>Made in</Text>
            <Text style={[s.th, { width: W.q }]}>Quantity</Text>
            <Text style={[s.th, { width: W.u }]}>U. Price</Text>
            <Text style={[s.th, { width: W.t, borderRightWidth: 0 }]}>Total Price</Text>
          </View>
          {doc.lines.map((l, i) => {
            const product = l.kind === "product";
            return (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: W.n, textAlign: "center" }]}>{product ? ++n : ""}</Text>
                <Text style={[s.td, { width: W.d }]}>{l.description}</Text>
                <Text style={[s.td, { width: W.m, textAlign: "center" }]}>{product ? t.made_in ?? "China" : ""}</Text>
                <Text style={[s.td, { width: W.q, textAlign: "right" }]}>{l.qty ?? ""}</Text>
                <Text style={[s.td, { width: W.u, textAlign: "right" }]}>{l.unit_price != null ? fmtMoney(l.unit_price) : ""}</Text>
                <Text style={[s.td, { width: W.t, textAlign: "right", borderRightWidth: 0 }]}>{fmtMoney(l.total)}</Text>
              </View>
            );
          })}
          {doc.payment.length ? (
            <View style={[s.tr, { paddingVertical: 2 }]} wrap={false}>
              <View style={{ width: W.n }} />
              <View style={{ width: "93%" }}>{doc.payment.map((p, i) => <Text key={i} style={s.pay}>{p}</Text>)}</View>
            </View>
          ) : null}
          <View style={[s.tr, { borderBottomWidth: 0 }]}>
            <Text style={[s.td, { width: "85%", textAlign: "right", fontFamily: "Times-Bold", fontSize: 9 }]}>Total C.F.R.: USD</Text>
            <Text style={[s.td, { width: W.t, textAlign: "right", fontFamily: "Times-Bold", fontSize: 9, borderRightWidth: 0 }]}>{fmtMoney(doc.total)}</Text>
          </View>
        </View>
        <View style={s.notes}>{(t.notes ?? []).map((x, i) => <Text key={i}>{x}</Text>)}</View>
        <View style={s.sign} wrap={false}>
          <View style={s.col}>
            <Text style={s.label}>Authorized Signature:</Text>
            <Text> </Text><Text> </Text>
            <Text style={s.label}>Name:</Text><Text>{doc.issuer.signer_name ?? ""}</Text>
            <Text style={s.label}>Title:</Text><Text>{doc.issuer.signer_title ?? ""}</Text>
          </View>
          <View style={{ width: 90 }}>
            <Text style={s.label}>Company Stamp</Text>
            {stamp}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Company:</Text><Text>{doc.issuer.company ?? ""}</Text>
            <Text style={s.label}>Telephone Number(s):</Text>
            <Text>{[doc.issuer.phone ? `Voice: ${doc.issuer.phone}` : "", doc.issuer.whatsapp ? `Whatsapp: ${doc.issuer.whatsapp}` : ""].filter(Boolean).join("   ")}</Text>
            <Text style={s.label}>Date of Order:</Text><Text>{fmtDay(doc.orderDate)}</Text>
          </View>
        </View>
        <Text style={{ marginTop: 12 }}>{t.footer ?? "This invoice is for export/import and payments purposes."}</Text>
      </Page>
    </Document>
  );
}

export async function invoicePdf(doc: InvoiceDoc): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf doc={doc} />);
}
