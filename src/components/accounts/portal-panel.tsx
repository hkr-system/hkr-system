"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { invitePortalUser, portalLoginLink, sendPortalLinkEmail, setPortalUserActive, type PortalState } from "@/app/(app)/accounts/portal-actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PortalUser = { id: string; email: string; language: string; active: boolean; last_login_at: string | null; contact: string | null; created_at: string };

export function PortalPanel({ accountId, users, contacts, defaultLang, canManage }: {
  accountId: string; users: PortalUser[]; contacts: { id: string; name: string; email: string | null }[]; defaultLang: "en" | "es"; canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [contact, setContact] = useState("");
  const [lang, setLang] = useState<"en" | "es">(defaultLang);
  const [msg, setMsg] = useState<PortalState>({});
  const run = (fn: () => Promise<PortalState>) => start(async () => { const r = await fn(); setMsg(r); router.refresh(); });
  const available = contacts.filter((c) => c.email && !users.some((u) => u.email === c.email!.toLowerCase()));

  return (
    <div className="grid gap-4" data-testid="portal-panel">
      <p className="text-sm text-muted-foreground">
        Clients see their orders, IMEIs, invoices, RMAs and credit notes, and send RMA requests with evidence.
        Only logins created here can enter (no self sign-up). They sign in with a one-time link: by email, or copy it and send it by WhatsApp.
      </p>
      <div className="grid gap-2">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-md border p-2 text-sm" data-testid="portal-user">
            <span className="font-medium">{u.contact ?? u.email}</span>
            <span className="text-xs text-muted-foreground">{u.email} · {u.language === "es" ? "Spanish" : "English"} · {u.last_login_at ? `last sign-in ${u.last_login_at.slice(0, 10)}` : "never signed in"}</span>
            <span className={`text-xs font-medium ${u.active ? "text-emerald-700" : "text-muted-foreground"}`}>{u.active ? "Active" : "Disabled"}</span>
            {canManage ? (
              <span className="ml-auto flex flex-wrap gap-1">
                {u.active ? (
                  <>
                    <Button size="xs" variant="outline" disabled={pending} data-testid="copy-link" onClick={() => run(() => portalLoginLink(u.id))}>Copy sign-in link</Button>
                    <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => sendPortalLinkEmail(u.id))}>Email the link</Button>
                  </>
                ) : null}
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setPortalUserActive(u.id, !u.active))}>{u.active ? "Disable" : "Enable"}</Button>
              </span>
            ) : null}
          </div>
        ))}
        {!users.length ? <p className="text-sm text-muted-foreground">No portal logins yet.</p> : null}
      </div>
      {msg.link ? (
        <div className="grid gap-1 rounded-md bg-emerald-50 p-3 text-sm" data-testid="portal-link">
          <span>One-time sign-in link (valid 1 hour). Copy it and send it to the client:</span>
          <Input readOnly value={msg.link} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          <Button size="xs" variant="outline" className="w-fit" onClick={() => navigator.clipboard?.writeText(msg.link!)}>Copy</Button>
        </div>
      ) : null}
      {msg.error ? <p className="text-sm text-destructive" role="alert">{msg.error}</p> : null}
      {msg.message ? <p className="text-sm text-emerald-700" data-testid="portal-message">{msg.message}</p> : null}
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-3">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Give portal access to a contact</span>
            <NativeSelect value={contact} onChange={(e) => setContact(e.target.value)} className="w-72" data-testid="portal-contact">
              <option value="">Choose a contact with email…</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}
            </NativeSelect>
          </div>
          <NativeSelect value={lang} onChange={(e) => setLang(e.target.value as "en" | "es")} className="w-auto" aria-label="Portal language">
            <option value="en">English</option><option value="es">Spanish</option>
          </NativeSelect>
          <Button size="sm" disabled={pending || !contact} data-testid="portal-invite" onClick={() => run(() => invitePortalUser(accountId, contact, lang))}>Create access</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Admin and account specialists create and disable portal logins.</p>}
    </div>
  );
}
