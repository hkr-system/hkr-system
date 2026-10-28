"use client";

import { useActionState } from "react";
import { requestLoginLink, type LinkState } from "../actions";
import { PORTAL_TEXT, type PortalLang } from "@/lib/portal/texts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PortalLoginForm({ lang }: { lang: PortalLang }) {
  const t = PORTAL_TEXT[lang];
  const [state, action, pending] = useActionState<LinkState, FormData>(requestLoginLink, {});
  if (state.sent) return <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="link-sent">{t.linkSent}</p>;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="lang" value={lang} />
      <div className="grid gap-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "…" : t.sendLink}</Button>
    </form>
  );
}
