"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const operations = [
  { href: "/app/dispatch", label: "Dispatch" },
  { href: "/app/jobs", label: "Work orders" },
  { href: "/app/inventory", label: "Inventory" },
];
const administration = [
  { href: "/app/ledger", label: "Ledger" },
  { href: "/app/settings", label: "Notifications" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceNavigation({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const items = admin ? [...operations, ...administration] : operations;

  return (
    <nav aria-label="Workspace" className="col-span-full row-start-2 pt-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pt-0">
      <ul className="flex flex-wrap gap-x-1 sm:gap-x-3">
        {items.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} data-active={isActive(pathname, href)} aria-current={pathname === href ? "page" : undefined}
              className="rl-nav-link lg:min-h-14">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
