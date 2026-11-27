"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavGroup {
  heading: string;
  items: Array<{ href: string; label: string; exact?: boolean }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Alur Kerja",
    items: [
      { href: "/dashboard", label: "Dashboard", exact: true },
      { href: "/jobs", label: "Lowongan" },
      { href: "/applications", label: "Antrean" },
      { href: "/settings", label: "Preferensi" },
      { href: "/runner", label: "Status Runner" },
    ],
  },
  {
    heading: "Profil & CV",
    items: [
      { href: "/onboarding", label: "Onboarding" },
      { href: "/profile", label: "Profil", exact: true },
      { href: "/profile/cv", label: "CV" },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi utama" className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.18em] text-ink-soft/80 uppercase">
            {group.heading}
          </p>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent-soft font-semibold text-accent-deep"
                      : "font-medium text-ink-soft hover:bg-paper-deep hover:text-ink",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
