import type { Metadata } from "next";
import { checkSection } from "@/lib/auth";
import { getSection } from "@/lib/nav";
import { ComingSoon } from "@/components/coming-soon";
import { NoAccess } from "@/components/no-access";

export const metadata: Metadata = { title: "Price lists" };

export default async function Page() {
  const access = await checkSection("price-lists");
  if (!access.allowed) return <NoAccess />;
  return <ComingSoon section={getSection("price-lists")} readOnly={access.readOnly} />;
}
