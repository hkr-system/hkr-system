import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal/session";
import { PORTAL_TERMS } from "@/lib/portal/texts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: { absolute: "Terms · Client portal" } };

// The official terms document (RMA address and procedure, bank / USDT details, responsibilities)
// is being written by Gabriel; until then only the SOP figures already public on /apply are shown.
export default async function PortalTerms() {
  const { t, lang } = await getPortalContext();
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t.terms}</h1>
      <Card><CardContent className="py-4 text-sm text-muted-foreground" data-testid="terms-soon">{t.termsSoon}</CardContent></Card>
      <Card>
        <CardHeader><CardTitle>{t.termsSummary}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
            {PORTAL_TERMS[lang].map(([k, v]) => (
              <div key={k} className="contents"><dt className="font-medium">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
