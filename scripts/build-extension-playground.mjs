import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
const dir = new URL("../packages/cli/playground/", import.meta.url);
await mkdir(dir, { recursive: true });
await build({
  entryPoints: ["src/extension-playground.jsx"],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: new URL("app.js", dir).pathname,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "css" },
});
await copyFile("public/extension-runner.js", new URL("runner.js", dir));
await writeFile(
  new URL("index.html", dir),
  '<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Devdevian SDK playground</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>',
);
console.log("Built CLI SDK playground assets.");
