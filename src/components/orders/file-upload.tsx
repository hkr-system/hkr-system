"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET, MAX_FILE_BYTES, sopFileName, storagePath } from "@/lib/files";
import { FILE_KINDS, type FileKind } from "@/lib/orders/constants";
import { registerFile } from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";

type Props = {
  accountId: string;
  accountCode: string;
  orderId?: string | null;
  orderNumber?: string | null;
  kinds?: FileKind[];          // allowed document types (default: all for orders, OTHER for the account)
  defaultKind?: FileKind;
  label?: string;
  onUploaded?: (fileId: string, file: File) => void | Promise<void>;
  testId?: string;
};

// Uploads straight from the browser to the private bucket (RLS checks the account), then
// registers the file. Names follow SOP §2.3: [code]_ORD-NN_[TYPE].
export function FileUpload({ accountId, accountCode, orderId = null, orderNumber = null, kinds, defaultKind, label, onUploaded, testId }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const allowed = kinds ?? FILE_KINDS.filter((k) => (orderId ? true : !k.order)).map((k) => k.kind);
  const [kind, setKind] = useState<FileKind>(defaultKind ?? allowed[0]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  function upload(file: File) {
    setMsg({});
    if (file.size > MAX_FILE_BYTES) {
      setMsg({ error: "The file is larger than 25 MB." });
      return;
    }
    start(async () => {
      const db = createClient();
      let name = sopFileName(accountCode, orderNumber, kind, file.name);
      let path = storagePath(accountId, orderNumber, name);
      let { error } = await db.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error && /exists|duplicate/i.test(error.message)) {
        // a second document of the same type: keep both, add the time
        const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
        name = sopFileName(accountCode, orderNumber, kind, file.name, stamp);
        path = storagePath(accountId, orderNumber, name);
        ({ error } = await db.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || undefined }));
      }
      if (error) {
        setMsg({ error: error.message });
        return;
      }
      const r = await registerFile({ accountId, orderId, kind, path, fileName: name, mime: file.type, size: file.size });
      if (r.error || !r.id) {
        setMsg({ error: r.error ?? "Could not save the file." });
        return;
      }
      if (onUploaded) await onUploaded(r.id, file);
      setMsg({ ok: `Saved as ${name}` });
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="grid gap-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        {allowed.length > 1 ? (
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as FileKind)} className="w-auto" aria-label="Document type">
            {FILE_KINDS.filter((k) => allowed.includes(k.kind)).map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </NativeSelect>
        ) : null}
        <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" aria-hidden /> {pending ? "Uploading…" : label ?? "Upload file"}
        </Button>
      </div>
      {msg.error ? <p className="text-xs text-destructive" role="alert">{msg.error}</p> : null}
      {msg.ok ? <p className="text-xs text-emerald-700">{msg.ok}</p> : null}
    </div>
  );
}
