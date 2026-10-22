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
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Retry-After", "15");
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
