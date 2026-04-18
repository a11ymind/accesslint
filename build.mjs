import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  sourcemap: false,
  legalComments: "none",
  external: ["@sparticuz/chromium", "puppeteer"],
});
