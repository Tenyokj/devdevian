export const storageKeys = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];
export function assertRuntime(env = process.env) {
  const hosted = env.VERCEL === "1",
    production = hosted || env.NODE_ENV === "production";
  if (!production) return;
  if (env.AUTH_TEST_UNVERIFIED === "1" || env.DEMO_MODE === "1")
    throw Error("Test registration and demo mode are forbidden in production.");
  if (hosted && (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN))
    throw Error(
      "Vercel requires durable cloud storage: configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
    );
  if (
    hosted &&
    (env.UPLOAD_DRIVER !== "s3" || storageKeys.some((key) => !env[key]))
  )
    throw Error("Vercel requires private S3 object storage for uploads.");
  if (
    env.TURSO_DATABASE_URL &&
    !/^libsql:\/\/|^https:\/\//.test(env.TURSO_DATABASE_URL)
  )
    throw Error("Cloud database URL must use libsql:// or https://.");
  if (
    env.UPLOAD_DRIVER === "s3" &&
    (!env.S3_ENDPOINT?.startsWith("https://") ||
      storageKeys.some((key) => !env[key]))
  )
    throw Error(
      "S3 uploads require an HTTPS endpoint, bucket and server credentials.",
    );
  if (!env.APP_URL) throw Error("APP_URL is required in production.");
  const url = new URL(env.APP_URL),
    local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error(
      "APP_URL must be an origin without credentials, query, path or fragment.",
    );
  if (
    url.protocol !== "https:" &&
    !(local && !hosted && url.protocol === "http:")
  )
    throw Error("Public production APP_URL must use HTTPS.");
}
export function allowedOrigin(req, env = process.env) {
  // TLS terminates at the hosting proxy. Do not trust arbitrary forwarded hosts.
  return (env.NODE_ENV === "production" || env.VERCEL === "1") && env.APP_URL
    ? new URL(env.APP_URL).origin
    : `${req.protocol}://${req.headers.host}`;
}
