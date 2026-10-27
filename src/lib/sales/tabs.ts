// Tab bars of the Sales and Accounts sections (plain data: usable from server pages).
export const SALES_TABS = [
  { href: "/sales", label: "Dashboard", exact: true },
  { href: "/orders", label: "All orders" },
  { href: "/orders/new", label: "New order", exact: true },
];

export function accountTabs(canCreate: boolean) {
  return [
    { href: "/accounts", label: "Overview", exact: true },
    { href: "/accounts/list", label: "All accounts" },
    ...(canCreate ? [{ href: "/accounts/new", label: "New account", exact: true }] : []),
  ];
}
