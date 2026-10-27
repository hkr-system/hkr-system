"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STAGES, type LeadStage, type LeadTier } from "@/lib/leads/constants";
import { TierBadge } from "./badges";
import { changeStage } from "@/app/(app)/leads/actions";

export type BoardLead = {
  id: string; company: string; country: string | null; tier: LeadTier | null; disqualified: boolean;
  stage: LeadStage; owner: string | null; next_action_date: string | null;
};

function Card({ lead, today }: { lead: BoardLead; today: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-testid={`board-card-${lead.company}`}
      className={cn(
        "cursor-grab touch-none rounded-lg border bg-background p-2.5 text-sm shadow-xs active:cursor-grabbing",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${lead.id}`} className="font-medium leading-tight hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {lead.company}
        </Link>
        <TierBadge tier={lead.tier} disqualified={lead.disqualified} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{lead.country ?? "—"}{lead.owner ? ` · ${lead.owner}` : " · no owner"}</span>
        {lead.next_action_date ? (
          <span className={lead.next_action_date < today ? "text-destructive" : ""}>{lead.next_action_date.slice(5)}</span>
        ) : null}
      </div>
    </div>
  );
}

function Column({ stage, leads, today }: { stage: LeadStage; leads: BoardLead[]; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      data-testid={`board-column-${stage}`}
      className={cn("flex w-60 shrink-0 flex-col rounded-xl bg-muted/60 p-2", isOver && "ring-2 ring-ring/40")}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium">
        <span>{stage}</span>
        <span className="text-muted-foreground">{leads.length}</span>
      </div>
      <div className="grid gap-2">
        {leads.map((l) => <Card key={l.id} lead={l} today={today} />)}
      </div>
    </div>
  );
}

export function LeadBoard({ initial, today }: { initial: BoardLead[]; today: string }) {
  const [leads, setLeads] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function move(id: string, stage: LeadStage, lostReason?: string) {
    const before = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    setError(null);
    start(async () => {
      const res = await changeStage(id, stage, lostReason);
      if (res.error) {
        setLeads(before);
        setError(res.error);
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const stage = e.over?.id as LeadStage | undefined;
    const lead = leads.find((l) => l.id === id);
    if (!stage || !lead || lead.stage === stage) return;
    if (stage === "Lost") {
      setPendingLost(id);
      setReason("");
      return;
    }
    move(id, stage);
  }

  return (
    <>
      {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((s) => <Column key={s} stage={s} leads={leads.filter((l) => l.stage === s)} today={today} />)}
        </div>
      </DndContext>
      <Dialog open={pendingLost !== null} onOpenChange={(o) => { if (!o) setPendingLost(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Lost</DialogTitle>
            <DialogDescription>Why was this lead lost? The reason is required and shown on the timeline.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Only buys new devices" aria-label="Lost reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingLost(null)}>Cancel</Button>
            <Button disabled={!reason.trim()} onClick={() => { move(pendingLost!, "Lost", reason.trim()); setPendingLost(null); }}>
              Mark Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
