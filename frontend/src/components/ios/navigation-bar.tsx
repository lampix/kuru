"use client";

import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface NavigationPageProps {
  title: string;
  /** Show a large title that collapses into the bar on scroll (iOS default for root screens). */
  largeTitle?: boolean;
  back?: { href: string; label: string };
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Optional content pinned under the bar (e.g. a search field or segmented control). */
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A screen with an iOS navigation bar. The large title scrolls with the content; once it is
 * scrolled away the inline title fades into the translucent bar.
 */
export function NavigationPage({
  title,
  largeTitle = true,
  back,
  leading,
  trailing,
  accessory,
  children,
  className,
}: NavigationPageProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(!largeTitle);

  useEffect(() => {
    if (!largeTitle || !sentinel.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!(entry?.isIntersecting ?? true)),
      { rootMargin: "-52px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [largeTitle]);

  return (
    <div className={cn("min-h-dvh", className)}>
      <header
        className={cn(
          "sticky top-0 z-30 pt-safe transition-[background-color,box-shadow] duration-200",
          collapsed ? "glass hairline-b" : "bg-grouped",
        )}
      >
        <div className="relative mx-auto flex h-11 max-w-3xl items-center px-2">
          <div className="z-10 flex min-w-0 flex-1 items-center">
            {back ? (
              <Link
                href={back.href}
                className="flex items-center gap-0.5 rounded-md py-1 pr-2 text-body text-tint active:opacity-50"
              >
                <ChevronLeft className="-ml-1 size-7" strokeWidth={2.4} aria-hidden />
                <span className="truncate">{back.label}</span>
              </Link>
            ) : (
              leading
            )}
          </div>
          <h2
            aria-hidden={largeTitle && !collapsed}
            className={cn(
              "pointer-events-none absolute inset-x-24 truncate text-center text-headline font-semibold transition-opacity duration-200",
              collapsed ? "opacity-100" : "opacity-0",
            )}
          >
            {title}
          </h2>
          <div className="z-10 flex flex-1 items-center justify-end gap-1">{trailing}</div>
        </div>
        {accessory && !largeTitle ? (
          <div className="mx-auto max-w-3xl px-4 pb-2">{accessory}</div>
        ) : null}
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-8">
        {largeTitle ? (
          <>
            <h1 className="pt-1 pb-2 text-large-title font-bold">{title}</h1>
            <div ref={sentinel} aria-hidden className="h-px" />
            {accessory ? <div className="pb-3">{accessory}</div> : null}
          </>
        ) : null}
        {children}
      </main>
    </div>
  );
}

/** A plain-text bar button (e.g. "Edit", "Done"). */
export function BarButton({
  children,
  bold,
  className,
  ...props
}: React.ComponentProps<"button"> & { bold?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md px-2 py-1 text-body text-tint active:opacity-50 disabled:opacity-30",
        bold && "font-semibold",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
