import type { Metadata, Viewport } from "next";

import "../globals.css";

export const metadata: Metadata = { title: "Kuru" };

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/** Root layout for `/` only; every other page lives under `app/[locale]`. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
