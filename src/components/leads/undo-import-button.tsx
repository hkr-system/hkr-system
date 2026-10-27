"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { undoImport } from "@/app/(app)/leads/import/actions";

export function UndoImportButton({ id, source }: { id: string; source: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (msg) return <span className="text-xs text-muted-foreground" data-testid="undo-result">{msg}</span>;
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>Undo</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo import “{source}”?</DialogTitle>
            <DialogDescription>
              Leads created by this import that nobody has worked yet (still New, no notes or contacts) will be deleted.
              Leads someone already worked, and existing leads that were updated, stay as they are. This cannot be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={pending}
              onClick={() => start(async () => {
                const r = await undoImport(id);
                setOpen(false);
                setMsg(r.error ? r.error : `Undone: removed ${r.removed}, kept ${r.kept}.`);
              })}>
              {pending ? "Undoing…" : "Undo import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
