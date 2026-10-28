import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtDay, fmtMoney, type CreditNoteDoc } from "./credit-note";

// PDF in the layout of HKR_Credit_Note_TEMPLATE.xlsx (sent to the client after the SD approves, SOP P10).
const s = StyleSheet.create({
  page: { padding: 32, fontFamily: "Times-Roman", fontSize: 8.5, color: "#0f1a33" },
  title: { fontFamily: "Times-Bold", fontSize: 15, textAlign: "center", marginBottom: 10 },
  draft: { color: "#d6192e" },
  no: { fontFamily: "Times-Bold", textAlign: "right", marginBottom: 10 },
  cols: { flexDirection: "row", gap: 12, marginBottom: 12 },
  col: { flex: 1 },
  label: { fontFamily: "Times-Bold", marginBottom: 2 },
  table: { borderWidth: 0.6, borderColor: "#0f1a33" },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: "#0f1a33" },
  th: { fontFamily: "Times-Bold", textAlign: "center", padding: 3, borderRightWidth: 0.6, borderColor: "#0f1a33" },
  td: { fontFamily: "Courier", fontSize: 8.5, padding: 3, borderRightWidth: 0.6, borderColor: "#0f1a33" },
  ref: { padding: 3, borderBottomWidth: 0.6, borderColor: "#0f1a33" },
  sign: { flexDirection: "row", gap: 16, marginTop: 28 },
  foot: { marginTop: 16 },
});
const W = { n: "7%", d: "47%", m: "9%", q: "10%", u: "13%", t: "14%" };

function CreditNotePdf({ doc }: { doc: CreditNoteDoc }) {
  const issuer = [doc.issuer.company, ...(doc.issuer.address ?? []), doc.issuer.phone].filter(Boolean) as string[];
  return (
    <Document title={`Credit note ${doc.number}`} author={doc.issuer.company ?? "HK Refurbished Stock"}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>COMMERCIAL CREDIT NOTE{doc.status === "draft" ? <Text style={s.draft}> — DRAFT</Text> : null}</Text>
        <Text style={s.no}>No: {doc.number}</Text>
        <View style={s.cols}>
          <View style={s.col}><Text style={s.label}>Issuer Name and Address:</Text>{issuer.length ? issuer.map((l) => <Text key={l}>{l}</Text>) : <Text>(set the issuer in Settings)</Text>}</View>
          <View style={s.col}>
            <Text style={s.label}>In favor of:</Text>
            <Text>{doc.inFavorOf}</Text>
            {doc.vatEori ? <Text>VAT / EORI: {doc.vatEori}</Text> : null}
            {doc.country ? <Text>{doc.country}</Text> : null}
            <Text>Client code: {doc.accountCode}</Text>
          </View>
          <View style={{ width: 110 }}><Text style={s.label}>Date of issue:</Text><Text>{fmtDay(doc.date)}</Text></View>
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
          <Text style={s.ref}>{doc.reference}</Text>
          {doc.lines.map((l, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: W.n, textAlign: "center" }]}>{i + 1}</Text>
              <Text style={[s.td, { width: W.d }]}>{l.description}</Text>
              <Text style={[s.td, { width: W.m }]}>China</Text>
              <Text style={[s.td, { width: W.q, textAlign: "right" }]}>{l.qty}</Text>
              <Text style={[s.td, { width: W.u, textAlign: "right" }]}>{fmtMoney(l.unitPrice)}</Text>
              <Text style={[s.td, { width: W.t, textAlign: "right", borderRightWidth: 0 }]}>{fmtMoney(l.total)}</Text>
            </View>
          ))}
          <View style={[s.tr, { borderBottomWidth: 0 }]}>
            <Text style={[s.td, { width: "86%", textAlign: "right", fontFamily: "Courier-Bold" }]}>Total C.F.R.: {doc.currency}</Text>
            <Text style={[s.td, { width: W.t, textAlign: "right", fontFamily: "Courier-Bold", borderRightWidth: 0 }]}>{fmtMoney(doc.total)}</Text>
          </View>
        </View>
        <View style={s.sign}>
          <View style={s.col}>
            <Text style={s.label}>Authorized Signature:</Text>
            <Text> </Text><Text> </Text>
            <Text style={s.label}>Name:</Text><Text>{doc.issuer.signer_name ?? ""}</Text>
            <Text style={s.label}>Title:</Text><Text>{doc.issuer.signer_title ?? ""}</Text>
          </View>
          <View style={{ width: 90 }}><Text style={s.label}>Company Stamp</Text></View>
          <View style={s.col}>
            <Text style={s.label}>Company:</Text><Text>{doc.issuer.company ?? ""}</Text>
            <Text style={s.label}>Telephone Number(s):</Text>
            <Text>{[doc.issuer.phone ? `Voice: ${doc.issuer.phone}` : "", doc.issuer.whatsapp ? `Whatsapp: ${doc.issuer.whatsapp}` : ""].filter(Boolean).join("   ")}</Text>
            <Text style={s.label}>Date of issue:</Text><Text>{fmtDay(doc.date)}</Text>
          </View>
        </View>
        <Text style={s.foot}>This invoice is for export/import and payments purposes.</Text>
      </Page>
    </Document>
  );
}

export async function creditNotePdf(doc: CreditNoteDoc): Promise<Buffer> {
  return renderToBuffer(<CreditNotePdf doc={doc} />);
}
