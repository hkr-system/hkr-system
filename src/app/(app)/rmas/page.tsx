import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { getSection } from "@/lib/nav";
import { ComingSoon } from "@/components/coming-soon";
import { NoAccess } from "@/components/no-access";

export const metadata: Metadata = { title: "RMAs" };

export default async function Page() {
  const access = await checkSection("rmas");
  if (!access.allowed) return <NoAccess />;
  return <ComingSoon section={getSection("rmas")} readOnly={access.readOnly} />;
}
