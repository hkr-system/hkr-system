"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET, MAX_FILE_BYTES } from "@/lib/files";
import { PORTAL_TEXT, type PortalLang } from "@/lib/portal/texts";
import { addPortalEvidence, submitPortalRma } from "../../../actions";
import { Button } from "@/components/ui/button";

export function AddEvidence({ lang, accountId, rmaNumber, unitId, imei, count }: {
  lang: PortalLang; accountId: string; rmaNumber: string; unitId: string; imei: string; count: number;
}) {
  const t = PORTAL_TEXT[lang];
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const upload = (files: File[]) => start(async () => {
    setMsg({});
    const db = createClient();
    let i = count;
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) { setMsg({ error: `${f.name}: max 25 MB` }); continue; }
      i += 1;
      const e = f.name.includes(".") ? `.${f.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
      const name = `${rmaNumber.replace("-RMA-", "_RMA-")}_PRUEBAS_${imei.slice(-6)}_${i}_${Date.now().toString(36)}${e}`;
      const path = `${accountId}/rmas/RMA-${rmaNumber.split("-RMA-")[1]}/${name}`;
      const up = await db.storage.from(FILES_BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) { setMsg({ error: up.error.message }); continue; }
      const r = await addPortalEvidence(unitId, path, name, f.type || "application/octet-stream", f.size);
      if (r.error) setMsg({ error: r.error }); else setMsg({ ok: t.evidenceAdded });
    }
    router.refresh();
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input ref={input} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) upload(f); }} />
      <Button size="xs" variant="outline" disabled={pending} onClick={() => input.current?.click()}>{pending ? "…" : t.addEvidence}</Button>
      {msg.error ? <span className="text-xs text-destructive">{msg.error}</span> : null}
      {msg.ok ? <span className="text-xs text-emerald-700">{msg.ok}</span> : null}
    </span>
  );
}

export function CompleteRequest({ lang, rmaId }: { lang: PortalLang; rmaId: string }) {
  const t = PORTAL_TEXT[lang];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => {
        const r = await submitPortalRma(rmaId);
        if ("error" in r && r.error) setError(r.error);
        else if ("ok" in r && !r.ok) setError(t.missingEvidence);
        router.refresh();
      })}>{t.completeRequest}</Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
