import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { sectionsFor } from "@/lib/nav";
import { sectionBadges } from "@/lib/section-badges";
import type { AppRole } from "@/lib/roles";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationsBell } from "@/components/shell/notifications-bell";

// The red counters and the bell are loaded AFTER the page shows (streamed inside <Suspense>),
// so a click never waits for them. One load per request, shared by the sidebar and the phone menu.
const loadBadges = cache(async (role: AppRole) => sectionBadges(await createClient(), role));

export function menuItems(role: AppRole, badges: Partial<Record<string, number>> = {}) {
  return sectionsFor(role).map(({ key, label, href, also }) => ({ key, label, href, also, badge: badges[key] ?? 0 }));
}

export async function SidebarWithBadges({ role, collapsed, width }: { role: AppRole; collapsed: boolean; width: number }) {
  return <AppSidebar items={menuItems(role, await loadBadges(role))} initialCollapsed={collapsed} initialWidth={width} />;
}

export async function MobileNavWithBadges({ role }: { role: AppRole }) {
  return <MobileNav items={menuItems(role, await loadBadges(role))} />;
}

export async function BellWithNotes({ timezone }: { timezone: string }) {
  const db = await createClient();
  const [{ data: notes }, { count: unread }] = await Promise.all([
    db.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(10),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  return <NotificationsBell unread={unread ?? 0} notes={(notes ?? []).map((n) => ({ ...n, when: formatDateTime(n.created_at, timezone) }))} />;
}
