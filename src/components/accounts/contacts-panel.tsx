"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteContact, saveContact, type ActionState } from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Contact = { id: string; name: string; role: string | null; phone_e164: string | null; email: string | null; language: string; whatsapp_opt_in: boolean };

function ContactForm({ accountId, country, contact, onDone }: { accountId: string; country: string | null; contact?: Contact; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (p, fd) => {
    const r = await saveContact(p, fd);
    if (r.ok && onDone) onDone();
    return r;
  }, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-6" data-testid="contact-form">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="country" value={country ?? ""} />
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <Input name="name" placeholder="Name *" required defaultValue={contact?.name} aria-label="Name" />
      <Input name="role" placeholder="Role (confirms orders…)" defaultValue={contact?.role ?? ""} aria-label="Role" />
      <Input name="phone" placeholder="+31 6 1234 5678" defaultValue={contact?.phone_e164 ?? ""} aria-label="Phone" />
      <Input name="email" type="email" placeholder="Email" defaultValue={contact?.email ?? ""} aria-label="Email" />
      <NativeSelect name="language" defaultValue={contact?.language ?? "en"} aria-label="Language">
        <option value="en">English</option><option value="es">Spanish</option>
      </NativeSelect>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="whatsapp_opt_in" defaultChecked={contact?.whatsapp_opt_in} /> WhatsApp OK</label>
        <Button type="submit" size="sm" disabled={pending}>{contact ? "Save" : "Add"}</Button>
      </div>
      {state.error ? <p className="text-xs text-destructive sm:col-span-6" role="alert">{state.error}</p> : null}
      {state.message && !contact ? <p className="text-xs text-emerald-700 sm:col-span-6">{state.message}</p> : null}
    </form>
  );
}

export function ContactsPanel({ accountId, country, contacts }: { accountId: string; country: string | null; contacts: Contact[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <Table data-testid="contacts-table">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Name</TableHead><TableHead>Role</TableHead><TableHead>WhatsApp / phone</TableHead>
            <TableHead>Email</TableHead><TableHead>Lang.</TableHead><TableHead>Opt-in</TableHead><TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => editing === c.id ? (
            <TableRow key={c.id}><TableCell colSpan={7} className="pl-4"><ContactForm accountId={accountId} country={country} contact={c} onDone={() => setEditing(null)} /></TableCell></TableRow>
          ) : (
            <TableRow key={c.id}>
              <TableCell className="pl-4 font-medium">{c.name}</TableCell>
              <TableCell className="text-xs">{c.role ?? "—"}</TableCell>
              <TableCell className="text-xs" data-tabular>{c.phone_e164 ?? "—"}</TableCell>
              <TableCell className="text-xs">{c.email ?? "—"}</TableCell>
              <TableCell className="text-xs uppercase">{c.language}</TableCell>
              <TableCell className="text-xs">{c.whatsapp_opt_in ? "Yes" : "No"}</TableCell>
              <TableCell className="text-right">
                <Button size="xs" variant="ghost" onClick={() => setEditing(c.id)}>Edit</Button>
                <Button size="xs" variant="ghost" disabled={pending}
                  onClick={() => { if (confirm(`Remove ${c.name}?`)) start(async () => { await deleteContact(c.id, accountId); }); }}>Remove</Button>
              </TableCell>
            </TableRow>
          ))}
          {!contacts.length ? <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No contacts yet.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <div className="px-4 pb-2">
        <p className="mb-2 text-sm font-medium">Add a contact</p>
        <ContactForm accountId={accountId} country={country} />
        <p className="mt-2 text-xs text-muted-foreground">A WhatsApp chat from this phone is linked to the account automatically (no new lead is created).</p>
      </div>
    </div>
  );
}
