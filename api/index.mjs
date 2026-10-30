import { randomUUID } from "node:crypto";
import { reportFailure } from "../observability.mjs";

// Catch initialization failures too. A failed dependency must not crash the
// module loader and turn every request into Vercel's plain-text error page.
export function createHandler(
  load = async () => (await import("../server.mjs")).createApp(),
) {
  let application,
    retryAt = 0;
  return async (req, res) => {
    // Vercel may expose the rewrite destination rather than the original path.
    // Only these public document routes may be reconstructed; no arbitrary URL.
    const incoming = new URL(req.url || "/", "https://internal.invalid");
    const publicPath = incoming.searchParams.get("__public_path");
    if (
      incoming.pathname === "/api" &&
      publicPath &&
      /^\/(?:conversation\/[1-9]\d{0,14}(?:\/[^/?#]+)?|sitemap\.xml|sitemaps\/conversations-[1-9]\d{0,4}\.xml)$/.test(
        publicPath,
      )
    ) {
      const params = new URLSearchParams();
      for (const key of ["reply_page", "reply", "reply_to"]) {
        const value = incoming.searchParams.get(key);
        if (value) params.set(key, value);
      }
      req.url = publicPath + (params.size ? "?" + params : "");
    }
    req.requestId ||= randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (!application && Date.now() >= retryAt) {
      application = Promise.resolve()
        .then(load)
        .catch((error) => {
          application = null;
          retryAt = Date.now() + 15000;
          reportFailure(error, {
            event: "initialization_failed",
            request_id: req.requestId,
          });
          return null;
        });
    }
    const app = application ? await application : null;
    if (app)
      return new Promise((resolve) => {
        const done = () => {
          res.off("finish", done);
          res.off("close", done);
          resolve();
        };
        res.once("finish", done);
        res.once("close", done);
        // Keep the invocation alive until async Express routes finish delivery.
        try {
          app(req, res);
        } catch (error) {
          reportFailure(error, {
            event: "handler_failed",
            request_id: req.requestId,
          });
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: "Something went wrong. Please try again.",
                request_id: req.requestId,
              }),
            );
          } else {
            res.end();
          }
        }
      });
    res.statusCode = 503;
    res.setHeader("Retry-After", "15");
    if (req.url?.startsWith("/conversation/")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Temporarily unavailable · Devdevian</title></head><body style="background:#0e1223;color:#f3f0ff;font:18px system-ui;padding:12vh 8vw"><h1>We’ll be back shortly.</h1><p>The service is temporarily unavailable. Please try again shortly.</p><a style="color:#b9a4ff" href="/app">Open Devdevian</a></body></html>',
      );
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error:
          "The service is temporarily unavailable. Please try again shortly.",
        request_id: req.requestId,
      }),
    );
  };
}
export default createHandler();
