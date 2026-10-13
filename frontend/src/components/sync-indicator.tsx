"use client";

import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { syncNow } from "@/lib/sync/manager";
import { useSyncStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";

/** Compact bar button showing offline / syncing / pending state; tap to sync. */
export function SyncIndicator() {
  const t = useTranslations("common");
  const { phase, pending } = useSyncStatus();
  const label =
    phase === "offline"
      ? t("offline")
      : phase === "syncing"
        ? t("syncing")
        : pending > 0
          ? t("pendingReviews", { count: pending })
          : t("online");
  const Icon = phase === "offline" ? CloudOff : phase === "error" ? TriangleAlert : RefreshCw;
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-1 text-footnote active:opacity-50",
        phase === "offline" || phase === "error" ? "text-ios-orange" : "text-tint",
      )}
    >
      <Icon className={cn("size-[18px]", phase === "syncing" && "animate-spin")} aria-hidden />
      {pending > 0 ? <span className="tabular-nums">{pending}</span> : null}
    </button>
  );
}
