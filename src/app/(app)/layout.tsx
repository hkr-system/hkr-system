import { getCurrentUser } from "@/lib/auth";
import { sectionsFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
import { NavLinks } from "@/components/shell/nav-links";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Clocks } from "@/components/shell/clocks";
import { UserMenu } from "@/components/shell/user-menu";
import { NoAccess } from "@/components/no-access";

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

  const items = sectionsFor(user.role).map(({ key, label, href }) => ({ key, label, href }));

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r bg-background p-3 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
            HKR
          </div>
          <span className="text-sm font-semibold">HKR System</span>
        </div>
        <NavLinks items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <MobileNav items={items} />
          <Clocks />
          <div className="ml-auto">
            <UserMenu name={user.fullName} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
