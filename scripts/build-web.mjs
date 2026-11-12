import { build } from "vite";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
await build({
  build: {
    manifest: true,
    rollupOptions: {
      input: { main: "index.html", conversation: "conversation.html" },
    },
  },
});
await build({
  build: {
    ssr: "src/public/conversation-server.jsx",
    outDir: "server-build",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "conversation.mjs" } },
  },
});
await mkdir("server-build", { recursive: true });
await writeFile(
  "server-build/template.html",
  await readFile("dist/conversation.html"),
);
// The render template is a function artifact, never a publicly indexed shell.
await rm("dist/conversation.html");

// Downloadable working examples make the upload flow testable without a toolchain.
const { buildExtension } = await import("./extension-build.mjs");
await mkdir("dist/extension-examples", { recursive: true });
for (const slug of [
  "studio-shell",
  "devi-companion",
  "popup-focus",
  "focus-desk",
  "developer-insights",
]) {
  const { build, ...pkg } = await buildExtension("examples/extensions/" + slug);
  await writeFile(
    "dist/extension-examples/" + slug + ".devext.json",
    JSON.stringify(pkg, null, 2),
  );
}
