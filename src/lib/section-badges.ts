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
//   RMAs     — batch deadlines (Phase 4)
export async function sectionBadges(db: SupabaseClient<Database>, role: AppRole): Promise<Partial<Record<SectionKey, number>>> {
  const [orders, chats, leads] = await Promise.all([
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
  ]);
  return { orders, whatsapp: chats, leads };
}
