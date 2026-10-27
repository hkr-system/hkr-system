import { getCurrentUser } from "@/lib/auth";
import { sectionsFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SIDEBAR_COOKIE } from "@/components/shell/sidebar-cookie";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { cookies } from "next/headers";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Clocks } from "@/components/shell/clocks";
import { UserMenu } from "@/components/shell/user-menu";
import { NoAccess } from "@/components/no-access";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { sectionBadges } from "@/lib/section-badges";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Logged in but no role yet (or deactivated): nothing to show.
  if (!user.role) {
    return (
      <div className="min-h-svh">
        <header className="flex h-14 items-center justify-end border-b bg-background px-4">
          <UserMenu name={user.fullName || user.email} email={user.email} roleLabel="No role" />
        </header>
        <NoAccess message="Your account is active but has no role yet. Ask Gabriel to give you one." />
      </div>
    );
  }

  const raw = (await cookies()).get(SIDEBAR_COOKIE)?.value ?? "";
  const [c, w] = raw.split(".");
  const sidebar = { collapsed: c === "1", width: Math.min(360, Math.max(176, Number(w) || 224)) };
  const db = await createClient();
  const [{ data: notes }, { count: unread }, badges] = await Promise.all([
    db.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(10),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    sectionBadges(db, user.role),
  ]);
  const items = sectionsFor(user.role).map(({ key, label, href, also }) => ({ key, label, href, also, badge: badges[key] ?? 0 }));

  return (
    <div className="flex min-h-svh">
      <AppSidebar items={items} initialCollapsed={sidebar.collapsed} initialWidth={sidebar.width} />
      <RealtimeRefresh tables={["notifications", "payments", "wa_conversations"]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <MobileNav items={items} />
          <Clocks />
          <div className="ml-auto flex items-center gap-1">
            <NotificationsBell unread={unread ?? 0}
              notes={(notes ?? []).map((n) => ({ ...n, when: formatDateTime(n.created_at, user.timezone) }))} />
            <UserMenu name={user.fullName} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
