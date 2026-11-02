"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runBackupNow } from "./actions";

export function BackupNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string; message?: string }>({});
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => setMsg(await runBackupNow()))}>
        {pending ? "Saving backup…" : "Run backup now"}
      </Button>
      {msg.error ? <span className="text-xs text-destructive">{msg.error}</span> : msg.message ? <span className="text-xs text-emerald-700">{msg.message}</span> : null}
    </span>
  );
}
