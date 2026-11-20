import { build } from "esbuild";

await build({
  entryPoints: ["src/features/field/service-worker.ts"],
  outfile: "public/tech-sw.js",
  bundle: true,
  minify: true,
  target: "es2022",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "eof",
});
