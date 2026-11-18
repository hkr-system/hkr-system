import type { AppRole } from "./roles";

// Single source of truth for the menu AND for page access.
// Hiding a menu item is only cosmetic; the real protection is RLS in the
// database. Visibility follows the permissions matrix in brief §8.
export type SectionKey =
  | "dashboard"
  | "accounts"
  | "orders"
  | "rmas"
  | "price-lists"
  | "leads"
  | "whatsapp"
  | "finance"
  | "settings";

export type Section = {
  key: SectionKey;
  label: string;
  href: `/${string}`;
  roles: readonly AppRole[];
  readOnlyFor?: readonly AppRole[];
  phase: number; // build phase that delivers the module (brief §10)
  also?: readonly string[]; // other paths that belong to this menu item (highlighted as active)
  summary: string;
};

const ALL: readonly AppRole[] = ["admin", "bd", "account_specialist"];

export const SECTIONS: readonly Section[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", roles: ALL, phase: 5,
    summary: "Widgets per role, daily report, Thursday queue and alerts." },
  { key: "accounts", label: "Accounts", href: "/accounts", roles: ALL, phase: 3,
    summary: "Client accounts, contacts, files and the new-account wizard." },
  { key: "orders", label: "Sales", href: "/sales", also: ["/orders"], roles: ALL, phase: 3,
    summary: "Sales dashboard, orders, payments, shipping readiness and invoices." },
  { key: "rmas", label: "RMAs", href: "/rmas", roles: ALL, phase: 4,
    summary: "RMA intake, IMEI check, weekly EU batches and credit notes." },
  { key: "price-lists", label: "Price lists", href: "/price-lists", roles: ALL, phase: 6,
    summary: "Price-list engine, client lists, outputs and weekly promotions." },
  { key: "leads", label: "Leads", href: "/leads", roles: ALL, readOnlyFor: ["account_specialist"], phase: 1,
    summary: "Leads, stages, next actions, the public qualification form and Brevo sync." },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp", roles: ALL, phase: 2,
    summary: "Inbox for the 4 numbers, templates and broadcasts." },
  { key: "finance", label: "Finance", href: "/finance", roles: ["admin"], phase: 3,
    summary: "Sales goals, sales history, projections and margins (admin)." },
  { key: "settings", label: "Settings", href: "/settings", roles: ["admin"], phase: 0,
    summary: "Parameters, users and scoring rules." },
];

/** Modules the admin can switch on/off per user in Settings → Users (Gabriel, Nov 18 2026). Finance and Settings stay
 *  admin-only by role. Same list as the SQL check on profiles.sections. */
export const ASSIGNABLE_SECTIONS = ["dashboard", "accounts", "orders", "rmas", "price-lists", "leads", "whatsapp"] as const satisfies readonly SectionKey[];

/** May this user use the module? Role = ceiling; `sections` = the boxes ticked by the admin (null = all of the role);
 *  an admin always has everything. Mirrors SQL has_section(). */
export function canUseSection(role: AppRole, sections: readonly string[] | null, key: SectionKey): boolean {
  if (!SECTIONS.find((s) => s.key === key)?.roles.includes(role)) return false;
  if (role === "admin" || sections === null) return true;
  return sections.includes(key);
}

export function sectionsFor(role: AppRole, sections: readonly string[] | null = null): Section[] {
  return SECTIONS.filter((s) => canUseSection(role, sections, s.key));
}

export function getSection(key: SectionKey): Section {
  const s = SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown section ${key}`);
  return s;
}
