"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ConfirmDialog, InputRow, ListRow, ListSection, SelectRow } from "@/components/ios";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { META, db, setMeta } from "@/lib/db";
import { useNow } from "@/hooks/use-now";
import { syncNow } from "@/lib/sync/manager";
import { useSyncStatus } from "@/lib/sync/hooks";

export function SyncSettings() {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const format = useFormatter();
  const now = useNow();
  const router = useRouter();
  const { phase, lastSync, pending } = useSyncStatus();
  const [me, setMe] = useState<Me | null>(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    api.me().then(setMe, () => setMe(null));
    api.authInfo().then(
      (info) => setRequiresLogin(info.requires_login),
      () => undefined,
    );
  }, []);

  const updateMe = async (patch: Partial<Pick<Me, "timezone" | "day_rollover_hour">>) => {
    const updated = await api.updateMe(patch);
    setMe(updated);
    await setMeta(META.timezone, updated.timezone);
    await setMeta(META.rolloverHour, updated.day_rollover_hour);
  };

  const clearLocal = async () => {
    await db.delete();
    await db.open();
    void syncNow({ full: true });
  };

  const status =
    phase === "syncing"
      ? common("syncing")
      : phase === "offline"
        ? common("offline")
        : lastSync && now
          ? common("syncedAt", {
              // Clamp small clock differences between server and device.
              time: format.relativeTime(
                new Date(Math.min(Date.parse(lastSync), now.getTime())),
                now,
              ),
            })
          : common("notSynced");
  const timezones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  return (
    <>
      <ListSection
        header={t("sync")}
        footer={pending ? common("pendingReviews", { count: pending }) : undefined}
      >
        <ListRow title={t("lastSync")} detail={status} />
        <ListRow
          title={t("syncNow")}
          tinted
          disabled={phase === "syncing"}
          onClick={() => void syncNow()}
        />
      </ListSection>

      {me ? (
        <ListSection header={t("studyDay")}>
          <SelectRow
            title={t("timezone")}
            value={me.timezone}
            onChange={(e) => void updateMe({ timezone: e.target.value })}
          >
            {(timezones.includes(me.timezone) ? timezones : [me.timezone, ...timezones]).map(
              (tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ),
            )}
          </SelectRow>
          <InputRow
            title={t("rolloverHour")}
            type="number"
            min={0}
            max={23}
            value={me.day_rollover_hour}
            suffix=":00"
            className="w-8"
            onChange={(e) => {
              const hour = Number(e.target.value);
              if (Number.isInteger(hour) && hour >= 0 && hour <= 23)
                void updateMe({ day_rollover_hour: hour });
            }}
          />
        </ListSection>
      ) : null}

      <ListSection>
        <ListRow title={t("resetLocal")} destructive onClick={() => setConfirm(true)} />
        {requiresLogin ? (
          <ListRow
            title={t("logout")}
            destructive
            onClick={() =>
              void api.logout().then(async () => {
                await db.delete();
                router.replace("/login");
              })
            }
          />
        ) : null}
      </ListSection>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("resetLocal")}
        message={t("resetLocalConfirm")}
        confirmLabel={common("delete")}
        onConfirm={() => void clearLocal()}
      />
    </>
  );
}
