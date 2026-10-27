"use client";

import { useActionState, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { updateSetting, type SettingState } from "./actions";

export type SettingRowData = {
  key: string;
  label: string;
  description: string | null;
  confidential: boolean;
  value: unknown;
};

function toText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function SettingRow({ row }: { row: SettingRowData }) {
  const [state, action, pending] = useActionState<SettingState, FormData>(updateSetting, {});
  const [text, setText] = useState(toText(row.value));
  const dirty = text !== toText(row.value);

  return (
    <TableRow data-testid={`setting-${row.key}`}>
      <TableCell className="align-top">
        <div className="flex items-center gap-1.5 font-medium">
          {row.label}
          {row.confidential ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="size-3.5 text-muted-foreground" aria-label="Confidential" />
              </TooltipTrigger>
              <TooltipContent>Confidential: only admin can see this value</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {row.description ? (
          <p className="mt-0.5 max-w-md text-xs whitespace-normal text-muted-foreground">{row.description}</p>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <form action={action} className="flex items-start gap-2">
          <input type="hidden" name="key" value={row.key} />
          <div className="grid gap-1">
            <Input name="value" value={text} onChange={(e) => setText(e.target.value)}
              className="w-72 font-mono text-xs" aria-label={row.label} />
            {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
          </div>
          <Button type="submit" size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {state.ok && !dirty ? <Check className="mt-1.5 size-4 text-emerald-600" aria-label="Saved" /> : null}
        </form>
      </TableCell>
    </TableRow>
  );
}
