import { randomUUID } from "node:crypto";
export function failureKind(error) {
  if (error?.status === 429) return "quota_limit";
  const text = String(error?.message || "");
  if (
    /capacity temporarily exceeded|SQLITE_BUSY|database is locked/i.test(text)
  )
    return "database_busy";
  if (/UNAUTHORIZED|AUTH_FAILED|unauthorized|token.*expired/i.test(text))
    return "database_auth";
  if (/timeout|timed out|ETIMEDOUT/i.test(text)) return "dependency_timeout";
  if (/configure|is required|requires|schema.*migration/i.test(text))
    return "configuration";
  return "internal";
}
export function reportFailure(error, fields = {}) {
  // Never log request bodies, cookies, addresses, SQL, provider payloads or
  // arbitrary error messages. Request IDs correlate a user's report with logs.
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_error",
      kind: failureKind(error),
      frames: String(error?.stack || "")
        .split("\n")
        .slice(1, 7)
        .map((line) => line.match(/([\w.-]+\.(?:mjs|js|jsx):\d+:\d+)/)?.[1])
        .filter(Boolean),
      ...fields,
    }),
  );
}
export function requestContext(req, res, next) {
  req.requestId ||= randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  const started = performance.now();
  res.on("finish", () => {
    const ms = Math.round(performance.now() - started);
    if (ms > 2000)
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "slow_request",
          request_id: req.requestId,
          route: req.route?.path || "/api",
          method: req.method,
          status: res.statusCode,
          ms,
        }),
      );
  });
  next();
}
export function apiError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const kind = failureKind(error);
  const status =
    error.status === 429
      ? 429
      : error.type === "entity.too.large"
        ? 413
        : error.type === "entity.parse.failed"
          ? 400
          : kind === "internal"
            ? 500
            : 503;
  if (status >= 500)
    reportFailure(error, {
      request_id: req.requestId,
      route: req.route?.path || "/api",
      method: req.method,
      status,
    });
  if (status === 503) res.setHeader("Retry-After", "15");
  if (status === 429) res.setHeader("Retry-After", "60");
  res.status(status).json({
    error:
      status === 429
        ? "This limit has been reached. Please try again later."
        : status === 413
          ? "Files must be 4 MB or smaller."
          : status === 400
            ? "Invalid JSON request."
            : status === 503
              ? "The service is temporarily unavailable. Please try again shortly."
              : "Something went wrong. Please try again.",
    request_id: req.requestId,
  });
}
