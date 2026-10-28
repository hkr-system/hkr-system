import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AppRole } from "@/lib/roles";
import type { SectionKey } from "@/lib/nav";

// Red counters next to each menu item: live counts of pending work (not notifications), so a
// number disappears only when the work is done. RLS limits every count to what the user may see.
//   Sales    — admin: payments waiting for confirmation; others: orders needing action
//   WhatsApp — open chats whose last message is from the client (unanswered)
//   Leads    — unread "new lead" / "lead qualified" notices
//   RMAs     — admin: RMAs to approve + units to batch; specialist: RMAs to verify + units to batch;
//              bd: her clients' RMAs waiting (requested / to verify / to approve)
export async function sectionBadges(db: SupabaseClient<Database>, role: AppRole): Promise<Partial<Record<SectionKey, number>>> {
  const [orders, chats, leads, rmas] = await Promise.all([
    db.from("order_overview").select("status, payment_awaiting, deposit_confirmed, balance_ok")
      .in("status", ["invoiced", "ready_to_ship"]).limit(1000)
      .then(async (r) => {
        if (role === "admin") {
          const { count } = await db.from("payments").select("id", { count: "exact", head: true }).eq("status", "awaiting_confirmation");
          return count ?? 0;
        }
        return (r.data ?? []).filter((o) => o.payment_awaiting
          || (o.status === "invoiced" && Number(o.deposit_confirmed) <= 0)
          || (o.status === "ready_to_ship" && !o.balance_ok)).length;
      }),
    db.from("wa_conversations").select("last_inbound_at, last_outbound_at").neq("status", "resolved").not("last_inbound_at", "is", null).limit(2000)
      .then((r) => (r.data ?? []).filter((c) => !c.last_outbound_at || c.last_inbound_at! > c.last_outbound_at).length),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).in("kind", ["new_lead", "lead_qualified"])
      .then((r) => r.count ?? 0),
    db.from("rma_overview").select("status, units_to_batch, intermediary_id").in("status", ["requested", "form_received", "verified", "approved", "awaiting_return", "credit_agreed"]).limit(2000)
      .then((r) => {
        const rows = r.data ?? [];
        const toBatch = rows.filter((x) => x.intermediary_id).reduce((t, x) => t + Number(x.units_to_batch ?? 0), 0);
        if (role === "admin") return rows.filter((x) => x.status === "verified").length + toBatch;
        if (role === "account_specialist") return rows.filter((x) => x.status === "form_received").length + toBatch;
        return rows.filter((x) => ["requested", "form_received", "verified"].includes(x.status!)).length;
      }),
  ]);
  return { orders, whatsapp: chats, leads, rmas };
}
