import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { groupRows, money2, type OutMeta, type OutRow } from "./outputs";
import { fmtDate } from "./outputs";

// Client price list PDF with HKR identity (navy type, red only as a thin accent — brand tokens).
const NAVY = "#0f1a33";
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9.5, color: NAVY },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  sub: { fontSize: 9, color: "#4b5568", marginTop: 3 },
  rule: { height: 2, backgroundColor: "#d6192e", marginBottom: 12, width: 48 },
  group: { marginBottom: 8 },
  model: { fontFamily: "Helvetica-Bold", fontSize: 10, paddingVertical: 3, borderBottomWidth: 0.6, borderColor: "#c9cfdb" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 6 },
  foot: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: "#6b7280", textAlign: "center" },
});

function ListPdf({ rows, meta, logo }: { rows: OutRow[]; meta: OutMeta; logo: Buffer | null }) {
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt attribute
  const logoEl = logo ? <Image src={logo} style={{ width: 92 }} /> : null;
  const validity = meta.validUntil ? `Valid ${fmtDate(meta.validFrom)} – ${fmtDate(meta.validUntil)}` : `Date ${fmtDate(meta.validFrom)}`;
  return (
    <Document title={meta.title} author="HK Refurbished Stock">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View><Text style={s.title}>{meta.title}</Text><Text style={s.sub}>{validity} · Grade A+++ · USD · FOB Hong Kong</Text></View>
          {logoEl}
        </View>
        <View style={s.rule} />
        {groupRows(rows).map((g) => (
          <View key={g.label} style={s.group} wrap={false}>
            <Text style={s.model}>{g.label}</Text>
            {g.rows.map((r) => (
              <View key={r.storage_gb} style={s.row}><Text>{r.storage_gb}GB</Text><Text>{money2(r.price_usd)}</Text></View>
            ))}
          </View>
        ))}
        <Text style={s.foot} fixed>HK Refurbished Stock · Hong Kong</Text>
      </Page>
    </Document>
  );
}

export async function toPdf(rows: OutRow[], meta: OutMeta, logo: Buffer | null) {
  return renderToBuffer(<ListPdf rows={rows} meta={meta} logo={logo} />);
}
