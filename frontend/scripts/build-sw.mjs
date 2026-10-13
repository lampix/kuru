// Builds public/sw.js after `next build` (see ADR 0002).
//
// 1. Bundle src/sw.ts with esbuild (honours the tsconfig "@/..." paths).
// 2. Inject a precache manifest: hashed assets from .next/static, the prerendered HTML of every
//    page (served at its route URL) and the icons/manifest from public/.
import { injectManifest } from "@serwist/build";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tmp = path.join(root, ".next", "sw-build");
const bundled = path.join(tmp, "sw.js");

await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await build({
  entryPoints: [path.join(root, "src", "sw.ts")],
  outfile: bundled,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: false,
  tsconfig: path.join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
}

// Prerendered pages: .next/server/app/en/settings.html → /en/settings
const appDir = path.join(root, ".next", "server", "app");
const pages = [];
for (const file of await walk(appDir)) {
  if (!file.endsWith(".html")) continue;
  const route =
    "/" +
    path
      .relative(appDir, file)
      .replace(/\.html$/, "")
      .split(path.sep)
      .join("/");
  if (route.includes("_not-found") || route.includes("[")) continue;
  const revision = createHash("md5")
    .update(await readFile(file))
    .digest("hex");
  pages.push({ url: route.replace(/\/index$/, "") || "/", revision });
}

const { count, size, warnings } = await injectManifest({
  swSrc: bundled,
  swDest: path.join(root, "public", "sw.js"),
  globDirectory: path.join(root, ".next"),
  globPatterns: ["static/**/*.{js,css,woff2,png,svg,ico}"],
  modifyURLPrefix: { "static/": "/_next/static/" },
  dontCacheBustURLsMatching: /^\/_next\/static\//,
  additionalPrecacheEntries: [
    ...pages,
    { url: "/manifest.webmanifest", revision: null },
    { url: "/icon.svg", revision: null },
    { url: "/icons/icon-192.png", revision: null },
    { url: "/icons/apple-touch-icon.png", revision: null },
  ],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
});
warnings.forEach((w) => console.warn(w));
console.log(
  `✓ Service worker: ${count} precache entries (${(size / 1024).toFixed(0)} KiB), ${pages.length} pages`,
);
await rm(tmp, { recursive: true, force: true });
