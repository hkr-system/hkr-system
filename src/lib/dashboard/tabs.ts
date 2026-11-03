import type { AppRole } from "@/lib/roles";

// Tab bar of the Dashboard section (brief §8: the daily report is for admin and the specialist, not bd).
export function dashboardTabs(role: AppRole) {
  return [
    { href: "/dashboard", label: "Overview", exact: true },
    ...(role === "bd" ? [] : [{ href: "/dashboard/report", label: "Daily report" }]),
    { href: "/dashboard/thursday", label: "Client updates" },
    { href: "/dashboard/escalations", label: "For the SD" },
  ];
}
