import { networkOrigins, validatePackage } from "./extension-package.mjs";
import { readFileSync } from "node:fs";
export function registerExtensionRunner(app) {
  app.get("/api/extensions/development", async (req, res) => {
    if (
      process.env.VERCEL ||
      process.env.NODE_ENV !== "development" ||
      !process.env.DEVDEVIAN_EXTENSION_PATH ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      )
    )
      return res
        .status(404)
        .json({ error: "Local extension development is not enabled." });
    try {
      const { buildExtension } = await import("./scripts/extension-build.mjs");
      res.json(await buildExtension(process.env.DEVDEVIAN_EXTENSION_PATH));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/extensions/runner", (req, res) => {
    let origins = [];
    try {
      const p = JSON.parse(String(req.query.network || "[]"));
      validatePackage({
        schema: 2,
        kind: "extension",
        permissions: p,
        entry: "main.js",
        files: { "main.js": "void 0" },
        styles: { light: "", dark: "" },
      });
      origins = networkOrigins(p);
      if (origins.some((x) => new URL(x).hostname === req.hostname))
        throw Error("App origin is not an extension network permission.");
    } catch {
      return res.status(400).send("Invalid sandbox network policy.");
    }
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": `default-src 'none'; script-src 'self' blob:; style-src 'unsafe-inline'; img-src data: blob: ${origins.join(" ")}; connect-src ${origins.length ? origins.join(" ") : "'none'"}; font-src data:; media-src data: blob:; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts`,
    });
    res.send(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;font:14px system-ui;color:#eae9ff;background:#131426}*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer}a{color:#b8abff}</style></head><body><div id="root"></div><script src="/api/extensions/runner-script"></script></body></html>',
    );
  });
  app.get("/api/extensions/runner-script", (_req, res) =>
    res
      .type("application/javascript")
      .set("Cache-Control", "public,max-age=300")
      .send(
        readFileSync(
          new URL("./public/extension-runner.js", import.meta.url),
          "utf8",
        ),
      ),
  );
}
