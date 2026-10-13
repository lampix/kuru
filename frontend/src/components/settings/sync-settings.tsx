"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { InputRow, ListRow, ListSection } from "@/components/ios";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
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
    setConfirm(false);
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
          <label className="group/row flex items-center">
            <span className="flex min-h-11 flex-1 items-center gap-3 py-2 pr-4 pl-4 hairline-b">
              <span className="flex-1">{t("timezone")}</span>
              <select
                value={me.timezone}
                onChange={(e) => void updateMe({ timezone: e.target.value })}
                className="max-w-[55%] bg-transparent text-right text-label-2 outline-none"
              >
                {(timezones.includes(me.timezone) ? timezones : [me.timezone, ...timezones]).map(
                  (tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ),
                )}
              </select>
            </span>
          </label>
          <InputRow
            title={t("rolloverHour")}
            type="number"
            min={0}
            max={23}
            value={me.day_rollover_hour}
            suffix={<span className="-ml-3">:00</span>}
            className="w-10"
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

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          className="max-w-[280px] rounded-[14px] border-0 bg-grouped-2 p-0 text-center"
          showCloseButton={false}
        >
          <DialogTitle className="px-4 pt-5 text-headline">{t("resetLocal")}</DialogTitle>
          <p className="px-4 pb-4 text-footnote">{t("resetLocalConfirm")}</p>
          <DialogFooter className="grid grid-cols-2 gap-0 hairline-t sm:flex-none">
            <button type="button" className="py-3 text-tint" onClick={() => setConfirm(false)}>
              {common("cancel")}
            </button>
            <button
              type="button"
              className="py-3 font-semibold text-ios-red"
              onClick={() => void clearLocal()}
            >
              {common("delete")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
