"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Edit only after the pencil" (Gabriel, Nov 3 2026: fewer slips of the finger). Everything inside is read-only — a
// native disabled <fieldset> also blocks Enter and the Save buttons — until ✏️ Edit is clicked. Cancel throws away what
// was typed (the block is mounted again with the saved values). After Save the block locks again; if the save
// failed, the message stays and ✏️ unlocks it again with what was typed.
// Forms that CREATE something new (new order, new account, new RMA…) are not wrapped.
// The ✏️ always sits at the TOP-RIGHT corner of its card (Gabriel, Nov 3 2026): "corner" (default) pins it to the nearest
// card / settings section; "top" puts it top-right above a block that is not inside one card; "inline" for a row in a table.
export function EditLock({ children, label = "Edit", className, testId, bar = "corner" }: {
  children: React.ReactNode; label?: string; className?: string; testId?: string; bar?: "corner" | "top" | "inline";
}) {
  const [editing, setEditing] = useState(false);
  const [round, setRound] = useState(0);
  const controls = editing ? (
    <Button type="button" size="xs" variant="ghost" onClick={() => { setEditing(false); setRound((r) => r + 1); }} data-testid="edit-cancel">
      Cancel
    </Button>
  ) : (
    <Button type="button" size="xs" variant="outline" onClick={() => setEditing(true)} aria-label={label} data-testid="edit-unlock">
      <Pencil className="size-3.5" aria-hidden /> {label}
    </Button>
  );
  return (
    <div className={cn("min-w-0", className)} data-testid={testId ?? "edit-lock"} data-editing={editing ? "1" : "0"}>
      <div data-edit-corner={bar === "corner" ? "" : undefined}
        className={cn("flex items-center justify-end gap-2", bar === "corner" ? "absolute top-3 right-3 z-10" : bar === "top" ? "mb-2" : "float-right ml-2")}>
        {editing ? <span className="text-xs text-muted-foreground">Editing — save or cancel</span> : null}
        {controls}
      </div>
      <fieldset
        key={round}
        disabled={!editing}
        // lock again as soon as the form is sent (the data is read before the fields are disabled)
        onSubmitCapture={() => setTimeout(() => setEditing(false), 0)}
        className={cn(
          "min-w-0",
          !editing && [
            // read-only look: readable text, no greyed-out fields, no Save buttons
            "[&_:disabled]:cursor-default [&_:disabled]:opacity-100",
            "[&_input:disabled]:border-transparent [&_input:disabled]:bg-muted/40 [&_select:disabled]:border-transparent [&_select:disabled]:bg-muted/40",
            "[&_textarea:disabled]:border-transparent [&_textarea:disabled]:bg-muted/40 [&_:disabled::placeholder]:text-transparent",
            "[&_form_button:not([type=button])]:hidden [&_[data-edit-only]]:hidden",
          ],
        )}
      >
        {children}
      </fieldset>
    </div>
  );
}
