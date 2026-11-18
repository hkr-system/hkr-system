import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseSection, getSection, type SectionKey } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole | null; // null = account exists but no role given yet
  timezone: string;
  sections: string[] | null; // modules ticked by the admin (Settings → Users); null = every module of the role
};

// Data Access Layer: the one place that reads "who is logged in".
// cache() = read once per request even if many components ask.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, email, full_name, role, timezone, active, sections")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    id: userId,
    email: profile?.email ?? String(claimsData?.claims?.email ?? ""),
    fullName: profile?.full_name || profile?.email || "",
    role: profile?.active ? (profile.role ?? null) : null,
    timezone: profile?.timezone ?? "America/El_Salvador",
    sections: profile?.sections ?? null,
  };
});

export type SectionAccess =
  | { allowed: true; user: CurrentUser & { role: AppRole }; readOnly: boolean }
  | { allowed: false; user: CurrentUser };

// Page-level check used by every module page. Pages render <NoAccess/> when
// allowed is false, so typing an admin URL gives a clean "No access" page.
export async function checkSection(key: SectionKey): Promise<SectionAccess> {
  const user = await getCurrentUser();
  const section = getSection(key);
  if (!user.role || !canUseSection(user.role, user.sections, section.key)) return { allowed: false, user };
  return {
    allowed: true,
    user: { ...user, role: user.role },
    readOnly: section.readOnlyFor?.includes(user.role) ?? false,
  };
}

// For Server Actions: throws instead of rendering, never trust the client.
export async function requireRole(roles: readonly AppRole[]) {
  const user = await getCurrentUser();
  if (!user.role || !roles.includes(user.role)) {
    throw new Error("You do not have access to this action.");
  }
  return { ...user, role: user.role };
}

/** For Server Actions of one module: the role must be allowed AND the module ticked for this user (Settings → Users). */
export async function requireSection(key: SectionKey, roles?: readonly AppRole[]) {
  const user = await getCurrentUser();
  if (!user.role || (roles && !roles.includes(user.role)) || !canUseSection(user.role, user.sections, key)) {
    throw new Error("You do not have access to this module.");
  }
  return { ...user, role: user.role };
}

/** Can the logged-in user use this module? (for hiding widgets / buttons of other modules inside a page) */
export function userCan(user: CurrentUser, key: SectionKey): boolean {
  return !!user.role && canUseSection(user.role, user.sections, key);
}
