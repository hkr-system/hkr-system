"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markSubmissionReviewed, takeLead } from "@/app/(app)/leads/actions";

export function TakeLeadButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { await takeLead(id); })}>
      {pending ? "…" : "Take it"}
    </Button>
  );
}

export function ReviewedButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { await markSubmissionReviewed(id); })}>
      {pending ? "…" : "Mark reviewed"}
    </Button>
  );
}
