"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { bodyVariableCount, fillBody, resolveVariables } from "@/lib/whatsapp/templates";
import { sendFile, sendTemplate, sendText, type WaState } from "@/app/(app)/whatsapp/actions";

export type ComposerTemplate = { id: string; name: string; language: string; category: string; components: unknown };

function Err({ state }: { state: WaState }) {
  return state.error ? <p role="alert" className="text-xs text-destructive">{state.error}</p> : null;
}

function useResetOnOk(state: WaState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return ref;
}

function TemplateForm({ conversationId, templates, lead }: {
  conversationId: string; templates: ComposerTemplate[]; lead: { company?: string | null; contact_name?: string | null };
}) {
  const [state, action, pending] = useActionState(sendTemplate, {});
  const [tplId, setTplId] = useState(templates[0]?.id ?? "");
  const tpl = templates.find((t) => t.id === tplId);
  const count = tpl ? bodyVariableCount(tpl.components) : 0;
  const defaults = resolveVariables(
    Array.from({ length: count }, (_, i) => ({ source: i === 0 ? "first_name" : "company" } as const)), lead);
  const [values, setValues] = useState<string[]>([]);
  const current = Array.from({ length: count }, (_, i) => values[i] ?? defaults[i] ?? "");

  if (!templates.length) {
    return <p className="text-sm text-muted-foreground">No approved templates yet. The admin syncs them in WhatsApp → Templates.</p>;
  }
  return (
    <form action={action} className="grid gap-2" data-testid="template-form">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="template_id" value={tplId} />
      <NativeSelect value={tplId} onChange={(e) => { setTplId(e.target.value); setValues([]); }} aria-label="Template">
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language} · {t.category.toLowerCase()}</option>)}
      </NativeSelect>
      {current.map((v, i) => (
        <Input key={`${tplId}-${i}`} name="var" value={v} aria-label={`Variable ${i + 1}`}
          onChange={(e) => setValues(current.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`{{${i + 1}}}`} />
      ))}
      {tpl ? <p className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{fillBody(tpl.components, current)}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}><Send /> {pending ? "Sending…" : "Send template"}</Button>
        <Err state={state} />
      </div>
    </form>
  );
}

export function Composer({ conversationId, windowOpen, templates, lead, canSend, blockedReason }: {
  conversationId: string; windowOpen: boolean; templates: ComposerTemplate[];
  lead: { company?: string | null; contact_name?: string | null }; canSend: boolean; blockedReason?: string;
}) {
  const [mode, setMode] = useState<"text" | "template">(windowOpen ? "text" : "template");
  const [textState, textAction, textPending] = useActionState(sendText, {});
  const [fileState, fileAction, filePending] = useActionState(sendFile, {});
  const textRef = useResetOnOk(textState);
  const fileRef = useResetOnOk(fileState);

  if (!canSend) return <p className="text-sm text-muted-foreground">{blockedReason}</p>;

  return (
    <div className="grid gap-2" data-testid="composer">
      {windowOpen ? (
        <div className="flex gap-1">
          <Button type="button" size="xs" variant={mode === "text" ? "secondary" : "ghost"} onClick={() => setMode("text")}>Message</Button>
          <Button type="button" size="xs" variant={mode === "template" ? "secondary" : "ghost"} onClick={() => setMode("template")}>Template</Button>
        </div>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="window-closed">
          The 24-hour window is closed: only approved templates can be sent until the contact writes again.
        </p>
      )}
      {mode === "template" || !windowOpen ? (
        <TemplateForm conversationId={conversationId} templates={templates} lead={lead} />
      ) : (
        <>
          <form ref={textRef} action={textAction} className="grid gap-2">
            <input type="hidden" name="conversation_id" value={conversationId} />
            <Textarea name="body" rows={2} placeholder="Write a reply…" aria-label="Message"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit(); }} />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={textPending}><Send /> {textPending ? "Sending…" : "Send"}</Button>
              <span className="text-xs text-muted-foreground">Ctrl+Enter to send</span>
              <Err state={textState} />
            </div>
          </form>
          <form ref={fileRef} action={fileAction} className="flex flex-wrap items-center gap-2 border-t pt-2">
            <input type="hidden" name="conversation_id" value={conversationId} />
            <Paperclip className="size-4 text-muted-foreground" aria-hidden />
            <Input type="file" name="file" className="h-8 w-56 text-xs" aria-label="File" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*,video/*" />
            <Input name="caption" placeholder="Caption (optional)" className="h-8 w-48 text-xs" />
            <Button type="submit" size="sm" variant="outline" disabled={filePending}>{filePending ? "Sending…" : "Send file"}</Button>
            <Err state={fileState} />
          </form>
        </>
      )}
    </div>
  );
}
