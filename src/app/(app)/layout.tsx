import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SIDEBAR_COOKIE } from "@/components/shell/sidebar-cookie";
import { RealtimeRefresh } from "@/components/whatsapp/realtime-refresh";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Clocks } from "@/components/shell/clocks";
import { UserMenu } from "@/components/shell/user-menu";
import { NoAccess } from "@/components/no-access";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { BellWithNotes, MobileNavWithBadges, SidebarWithBadges, menuItems } from "@/components/shell/streamed";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Logged in but no role yet (or deactivated): nothing to show. A client goes to the portal.
  if (!user.role) {
    const { data: portal } = await (await createClient()).from("portal_account").select("id").maybeSingle();
    if (portal) redirect("/portal");
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
  const role = user.role;

  // The page never waits for the menu counters or the bell: they stream in right after.
  return (
    <div className="flex min-h-svh">
      <Suspense fallback={<AppSidebar items={menuItems(role)} initialCollapsed={sidebar.collapsed} initialWidth={sidebar.width} />}>
        <SidebarWithBadges role={role} collapsed={sidebar.collapsed} width={sidebar.width} />
      </Suspense>
      <RealtimeRefresh tables={["notifications", "payments", "wa_conversations", "rmas"]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Suspense fallback={<MobileNav items={menuItems(role)} />}><MobileNavWithBadges role={role} /></Suspense>
          <Clocks />
          <div className="ml-auto flex items-center gap-1">
            <Suspense fallback={<NotificationsBell unread={0} notes={[]} />}><BellWithNotes timezone={user.timezone} /></Suspense>
            <UserMenu name={user.fullName} email={user.email} roleLabel={ROLE_LABELS[role]} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
