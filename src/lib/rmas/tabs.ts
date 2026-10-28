// Tab bar of the RMAs section (plain data: usable from server pages).
import type { AppRole } from "@/lib/roles";

export function rmaTabs(role: AppRole) {
  return [
    { href: "/rmas", label: "RMAs", exact: true },
    ...(role !== "bd" ? [{ href: "/rmas/batches", label: "EU batches" }] : []),
    { href: "/rmas/credit-notes", label: "Credit notes" },
    ...(role === "admin" ? [{ href: "/rmas/analytics", label: "Defect analytics" }] : []),
    { href: "/rmas/new", label: "New RMA", exact: true },
  ];
}
