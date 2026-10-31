import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(
  new URL("../prototypes/workspaces", import.meta.url),
);
const server = await createServer({
  configFile: false,
  root,
  server: {
    host: "127.0.0.1",
    port: 4180,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
await server.listen();
server.printUrls();
console.log(
  "Devdevian 0.2 concept · sample workspace · session-only interactions",
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
