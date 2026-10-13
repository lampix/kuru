import Link from "next/link";

import { LOCALE_OVERRIDE_COOKIE, locales, routing } from "@/i18n/routing";

/**
 * `/` (the PWA start URL) picks the locale on the client, so the page is static, works offline
 * and no request-buffering proxy is needed. Cascade (design doc §6.1): manual override cookie →
 * system languages (`navigator.languages`) → English. Mirrors `resolveLocale` in i18n/detect.ts.
 */
const script = `(function(){
  var supported=${JSON.stringify(locales)};
  var m=document.cookie.match(/(?:^|; )${LOCALE_OVERRIDE_COOKIE}=([^;]+)/);
  var pick=m&&supported.indexOf(m[1])>=0?m[1]:null;
  if(!pick){var langs=navigator.languages||[navigator.language];
    for(var i=0;i<langs.length&&!pick;i++){var b=String(langs[i]).toLowerCase().split(/[-_]/)[0];if(supported.indexOf(b)>=0)pick=b;}}
  location.replace("/"+(pick||${JSON.stringify(routing.defaultLocale)})+location.search+location.hash);
})();`;

export default function RootPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <noscript>
        <p style={{ padding: 24 }}>
          <Link href="/en">English</Link> · <Link href="/de">Deutsch</Link>
        </p>
      </noscript>
    </>
  );
}
