"use client";

import { ChartColumn, Layers, Search, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", key: "decks", icon: Layers },
  { href: "/browse", key: "browse", icon: Search },
  { href: "/stats", key: "stats", icon: ChartColumn },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/** Bottom tab bar with a translucent material, respecting the home indicator safe area. */
export function TabBar() {
  const t = useTranslations("tabs");
  const pathname = usePathname();
  return (
    <nav
      aria-label="Kuru"
      className="fixed inset-x-0 bottom-0 z-40 glass pb-safe hairline-t print:hidden"
    >
      <ul className="mx-auto flex h-[49px] max-w-3xl">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 pt-1",
                  active ? "text-tint" : "text-ios-gray",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                <span className="text-[10px] leading-3 font-medium">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
