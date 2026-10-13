"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { IosButton } from "@/components/ios";
import { useRouter } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api/client";
import { syncNow } from "@/lib/sync/manager";

export function LoginScreen() {
  const t = useTranslations("login");
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(token);
      void syncNow();
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError && err.isUnauthorized ? t("invalid") : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 pt-safe">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="mx-auto mb-6 size-20 rounded-[22%]" />
      <h1 className="mb-8 text-center text-title-1 font-bold">{t("title")}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="rounded-[10px] bg-grouped-2 px-4 py-3">
          <span className="sr-only">{t("token")}</span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder={t("token")}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full bg-transparent outline-none"
          />
        </label>
        {error ? <p className="px-1 text-footnote text-ios-red">{error}</p> : null}
        <IosButton type="submit" size="lg" disabled={!token || busy}>
          {t("submit")}
        </IosButton>
      </form>
    </main>
  );
}
