import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  bd: "Business development",
  account_specialist: "Account specialist",
};
