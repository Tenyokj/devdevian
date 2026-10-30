import { build } from "vite";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
await build({
  build: {
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
