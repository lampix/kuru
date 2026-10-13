import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-title-2 font-semibold">404</p>
      <Link href="/" className="text-tint">
        {t("back")}
      </Link>
    </main>
  );
}
