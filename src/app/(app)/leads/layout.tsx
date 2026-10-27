import { getCurrentUser } from "@/lib/auth";
import { LeadsTabs } from "@/components/leads/leads-tabs";

export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const canWork = user.role === "admin" || user.role === "bd";
  return (
    <>
      {user.role ? <LeadsTabs canWork={canWork} /> : null}
      {children}
    </>
  );
}
