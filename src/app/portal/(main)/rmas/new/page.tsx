import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal/session";
import { RmaRequestForm } from "./rma-request-form";

export const metadata: Metadata = { title: { absolute: "RMA request · Client portal" } };

export default async function NewPortalRma() {
  const { account, t, lang, contactName, email } = await getPortalContext();
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t.newRma}</h1>
      <RmaRequestForm lang={lang} accountId={account.id} contactName={contactName ?? ""} contactInfo={email} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
