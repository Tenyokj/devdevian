const origin = process.env.HEALTHCHECK_URL || "https://devdevian.vercel.app";
const url = new URL("/api/health", origin);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw Error("Use HTTPS for the public health check.");
let ok = false;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    const data = await response.json();
    if (response.ok && data.ok === true) {
      ok = true;
      break;
    }
  } catch {}
  if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log(
  JSON.stringify({ event: ok ? "health_check_passed" : "health_check_failed" }),
);
if (!ok) process.exitCode = 1;
