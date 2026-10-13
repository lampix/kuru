import { type NextRequest, NextResponse } from "next/server";

import { isLocale, parseAcceptLanguage, resolveLocale } from "@/i18n/detect";
import { LOCALE_OVERRIDE_COOKIE } from "@/i18n/routing";

/** Redirect locale-less paths (e.g. `/` or `/settings`) to the user's locale. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return NextResponse.next();

  const locale = resolveLocale(
    request.cookies.get(LOCALE_OVERRIDE_COOKIE)?.value,
    parseAcceptLanguage(request.headers.get("accept-language")),
  );
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip the API (uploads must stream unbuffered), Next internals and files with an extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
