"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { META, setMeta } from "@/lib/db";
import { startSyncManager } from "@/lib/sync/manager";
import { useSyncStatus } from "@/lib/sync/hooks";

function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", type: "module", updateViaCache: "none" })
    .catch((error: unknown) => console.warn("Service worker registration failed", error));
}

const TIMEZONE_FLAG = "kuru.timezoneAdopted";

/**
 * On first launch, use the device's timezone for study-day boundaries (like Anki) unless the
 * account already has a non-default one.
 */
function adoptDeviceTimezone() {
  try {
    if (localStorage.getItem(TIMEZONE_FLAG)) return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void api.me().then(
      async (me) => {
        localStorage.setItem(TIMEZONE_FLAG, "1");
        if (me.timezone === "UTC" && device && device !== "UTC") {
          const updated = await api.updateMe({ timezone: device });
          await setMeta(META.timezone, updated.timezone);
        }
      },
      () => undefined,
    );
  } catch {
    // localStorage unavailable
  }
}

/** Client-side app services: service worker, background sync and auth redirects. */
export function AppProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phase } = useSyncStatus();

  useEffect(() => {
    registerServiceWorker();
    adoptDeviceTimezone();
    return startSyncManager();
  }, []);

  useEffect(() => {
    if (phase === "unauthorized" && pathname !== "/login") router.replace("/login");
  }, [phase, pathname, router]);

  return children;
}
