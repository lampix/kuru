"use client";

import { CircleAlert, CircleCheck, FileArchive } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { IosButton, ListRow, ListSection, NavigationPage, ProgressBar } from "@/components/ios";
import { api } from "@/lib/api/client";
import type { ImportJob } from "@/lib/api/types";
import { uploadImport } from "@/lib/api/upload";
import { syncNow } from "@/lib/sync/manager";

const STAGES = [
  "queued",
  "extracting",
  "reading",
  "structure",
  "notes",
  "cards",
  "reviews",
  "media",
  "done",
  "failed",
];
const POLL_MS = 1000;

export function ImportScreen() {
  const t = useTranslations("import");
  const settings = useTranslations("settings");
  const format = useFormatter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ImportJob[]>([]);

  const loadRecent = useCallback(() => {
    api.imports.jobs().then(setRecent, () => setRecent([]));
  }, []);
  useEffect(loadRecent, [loadRecent]);

  // Poll the job until it finishes, then pull the imported cards.
  const active = job && (job.status === "pending" || job.status === "processing");
  useEffect(() => {
    if (!job || !active) return;
    const timer = setTimeout(() => {
      api.imports.status(job.id).then(
        (next) => {
          setJob(next);
          if (next.status === "completed") void syncNow().then(loadRecent);
          if (next.status === "failed") loadRecent();
        },
        (err: unknown) => setError(String(err)),
      );
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, active, loadRecent]);

  const start = async () => {
    if (!file) return;
    setError(null);
    setJob(null);
    setUploadProgress(0);
    try {
      setJob(await uploadImport(file, setUploadProgress));
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadProgress(null);
    }
  };

  const stage = job ? (STAGES.includes(job.stage) ? job.stage : "queued") : null;
  const stats = job?.stats ?? {};

  return (
    <NavigationPage
      title={t("title")}
      largeTitle={false}
      back={{ href: "/settings", label: settings("title") }}
    >
      <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-2 text-center">
        <FileArchive className="size-12 text-tint" strokeWidth={1.5} aria-hidden />
        <h1 className="text-title-2 font-bold">{settings("importTitle")}</h1>
        <p className="text-subhead text-label-2">{t("description")}</p>
      </div>

      <ListSection footer={t("exportHint")}>
        <ListRow
          title={file ? file.name : t("chooseFile")}
          tinted={!file}
          detail={
            file
              ? format.number(file.size / 1024 / 1024, { maximumFractionDigits: 1 }) + " MB"
              : undefined
          }
          onClick={() => input.current?.click()}
        />
        <input
          ref={input}
          type="file"
          accept=".apkg,.colpkg"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </ListSection>

      <div className="mt-4">
        <IosButton
          size="lg"
          disabled={!file || uploadProgress !== null || Boolean(active)}
          onClick={() => void start()}
        >
          {uploadProgress !== null
            ? t("uploading", { percent: Math.round(uploadProgress * 100) })
            : t("upload")}
        </IosButton>
      </div>

      {uploadProgress !== null ? <ProgressBar value={uploadProgress} className="mt-4" /> : null}

      {job ? (
        <ListSection>
          <div className="flex flex-col gap-2 p-4" aria-live="polite">
            <div className="flex items-center gap-2">
              {job.status === "completed" ? (
                <CircleCheck className="size-5 text-ios-green" />
              ) : job.status === "failed" ? (
                <CircleAlert className="size-5 text-ios-red" />
              ) : null}
              <span className="font-semibold">
                {job.status === "completed"
                  ? t("completed")
                  : job.status === "failed"
                    ? t("failed")
                    : t(`stage.${stage as "queued"}`)}
              </span>
            </div>
            {active ? <ProgressBar value={job.progress} /> : null}
            {job.status === "completed" ? (
              <p className="text-subhead text-label-2">
                {t("summary", {
                  notes: Number(stats.notes_added ?? 0) + Number(stats.notes_updated ?? 0),
                  cards: Number(stats.cards_added ?? 0) + Number(stats.cards_updated ?? 0),
                  reviews: Number(stats.reviews_added ?? 0),
                  media: Number(stats.media_files ?? 0),
                })}
              </p>
            ) : null}
            {job.message ? <p className="text-subhead text-ios-red">{job.message}</p> : null}
          </div>
        </ListSection>
      ) : null}

      {error ? <p className="mt-3 px-4 text-footnote text-ios-red">{error}</p> : null}

      {recent.length ? (
        <ListSection header={t("recent")}>
          {recent.slice(0, 5).map((item) => (
            <ListRow
              key={item.id}
              title={item.filename}
              subtitle={format.dateTime(new Date(item.created_at), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              detail={
                item.status === "completed" ? (
                  <CircleCheck className="size-5 text-ios-green" aria-label={t("completed")} />
                ) : item.status === "failed" ? (
                  <CircleAlert className="size-5 text-ios-red" aria-label={t("failed")} />
                ) : (
                  `${Math.round(item.progress * 100)} %`
                )
              }
            />
          ))}
        </ListSection>
      ) : null}
    </NavigationPage>
  );
}
