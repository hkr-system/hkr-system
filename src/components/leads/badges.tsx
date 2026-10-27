import { cn } from "@/lib/utils";
import { STAGE_STYLES, TIER_STYLES, type LeadStage, type LeadTier } from "@/lib/leads/constants";

export function StageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", STAGE_STYLES[stage], className)}>
      {stage}
    </span>
  );
}

export function TierBadge({ tier, disqualified }: { tier: LeadTier | null; disqualified?: boolean }) {
  if (disqualified) {
    return (
      <span className="inline-flex items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive" title="Disqualified">
        DQ
      </span>
    );
  }
  if (!tier) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex size-5 items-center justify-center rounded text-[11px] font-semibold", TIER_STYLES[tier])} title={`Tier ${tier}`}>
      {tier}
    </span>
  );
}
