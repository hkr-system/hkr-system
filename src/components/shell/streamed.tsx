import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { SECTIONS, canUseSection, sectionsFor } from "@/lib/nav";
import { sectionBadges } from "@/lib/section-badges";
import type { AppRole } from "@/lib/roles";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationsBell } from "@/components/shell/notifications-bell";

// The red counters and the bell are loaded AFTER the page shows (streamed inside <Suspense>),
// so a click never waits for them. One load per request, shared by the sidebar and the phone menu.
const loadBadges = cache(async (role: AppRole) => sectionBadges(await createClient(), role));

type Mods = readonly string[] | null;
export function menuItems(role: AppRole, badges: Partial<Record<string, number>> = {}, sections: Mods = null) {
  return sectionsFor(role, sections).map(({ key, label, href, also }) => ({ key, label, href, also, badge: badges[key] ?? 0 }));
}

export async function SidebarWithBadges({ role, collapsed, width, sections = null }: { role: AppRole; collapsed: boolean; width: number; sections?: Mods }) {
  return <AppSidebar items={menuItems(role, await loadBadges(role), sections)} initialCollapsed={collapsed} initialWidth={width} />;
}

export async function MobileNavWithBadges({ role, sections = null }: { role: AppRole; sections?: Mods }) {
  return <MobileNav items={menuItems(role, await loadBadges(role), sections)} />;
}

export async function BellWithNotes({ timezone, role, sections = null }: { timezone: string; role?: AppRole; sections?: Mods }) {
  const db = await createClient();
  // notices that open a module this user cannot use are left out (Gabriel, Nov 18 2026: modules switched off per user)
  const blocked = role ? SECTIONS.filter((s) => !canUseSection(role, sections, s.key)).flatMap((s) => [s.href, ...(s.also ?? [])]) : [];
  const scope = <Q extends { or: (f: string) => Q }>(q: Q) => blocked.reduce((x, pre) => x.or(`link.is.null,link.not.like.${pre}*`), q);
  const [{ data: notes }, { count: unread }] = await Promise.all([
    scope(db.from("notifications").select("id, title, body, link, read_at, created_at")).order("created_at", { ascending: false }).limit(10),
    scope(db.from("notifications").select("id", { count: "exact", head: true })).is("read_at", null),
  ]);
  return <NotificationsBell unread={unread ?? 0} notes={(notes ?? []).map((n) => ({ ...n, when: formatDateTime(n.created_at, timezone) }))} />;
}
