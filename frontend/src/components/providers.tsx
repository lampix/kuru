"use client";

import { useLocale } from "next-intl";
import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { META, setMeta } from "@/lib/db";
import { startSyncManager } from "@/lib/sync/manager";
import { useSyncStatus } from "@/lib/sync/hooks";

function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", type: "module", updateViaCache: "none" })
    .catch((error: unknown) => console.warn("Service worker registration failed", error));
}

/** Client-side app services: service worker, background sync and auth redirects. */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { phase } = useSyncStatus();

  useEffect(() => {
    registerServiceWorker();
    return startSyncManager();
  }, []);

  useEffect(() => {
    // The service worker reads this to redirect `/` to the right locale while offline.
    void setMeta(META.locale, locale);
  }, [locale]);

  useEffect(() => {
    if (phase === "unauthorized" && pathname !== "/login") router.replace("/login");
  }, [phase, pathname, router]);

  return children;
}
