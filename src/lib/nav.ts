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
  | "settings";

export type Section = {
  key: SectionKey;
  label: string;
  href: `/${string}`;
  roles: readonly AppRole[];
  readOnlyFor?: readonly AppRole[];
  phase: number; // build phase that delivers the module (brief §10)
  summary: string;
};

const ALL: readonly AppRole[] = ["admin", "bd", "account_specialist"];

export const SECTIONS: readonly Section[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", roles: ALL, phase: 5,
    summary: "Widgets per role, daily report, Thursday queue and alerts." },
  { key: "accounts", label: "Accounts", href: "/accounts", roles: ALL, phase: 3,
    summary: "Client accounts, contacts, files and the new-account wizard." },
  { key: "orders", label: "Orders", href: "/orders", roles: ALL, phase: 3,
    summary: "Orders, payments, shipping readiness and invoices." },
  { key: "rmas", label: "RMAs", href: "/rmas", roles: ALL, phase: 4,
    summary: "RMA intake, IMEI check, weekly EU batches and credit notes." },
  { key: "price-lists", label: "Price lists", href: "/price-lists", roles: ALL, phase: 6,
    summary: "Price-list engine, client lists, outputs and weekly promotions." },
  { key: "leads", label: "Leads", href: "/leads", roles: ALL, readOnlyFor: ["account_specialist"], phase: 1,
    summary: "Leads, stages, next actions, the public qualification form and Brevo sync." },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp", roles: ALL, phase: 2,
    summary: "Inbox for the 4 numbers, templates and broadcasts." },
  { key: "settings", label: "Settings", href: "/settings", roles: ["admin"], phase: 0,
    summary: "Parameters, users and scoring rules." },
];

export function sectionsFor(role: AppRole): Section[] {
  return SECTIONS.filter((s) => s.roles.includes(role));
}

export function getSection(key: SectionKey): Section {
  const s = SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown section ${key}`);
  return s;
}
