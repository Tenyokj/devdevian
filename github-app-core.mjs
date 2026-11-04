import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
export const githubError = (message, status = 503) =>
  Object.assign(Error(message), { status, githubPublic: true });
export function appConfig(env = process.env) {
  return {
    id: env.GITHUB_APP_CLIENT_ID,
    secret: env.GITHUB_APP_CLIENT_SECRET,
    slug: env.GITHUB_APP_SLUG,
    key: env.GITHUB_APP_TOKEN_KEY,
    webhook: env.GITHUB_APP_WEBHOOK_SECRET,
    origin: env.APP_URL,
  };
}
export const appConfigured = (c) =>
  !!(
    c.id &&
    c.secret &&
    /^[a-z0-9-]+$/.test(c.slug || "") &&
    /^[a-f0-9]{64}$/i.test(c.key || "") &&
    c.webhook?.length >= 32 &&
    c.origin
  );
export function sealToken(value, user, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from("github-app:" + user));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function openToken(value, user, key) {
  try {
    const [iv, tag, data] = value
      .split(".")
      .map((b) => Buffer.from(b, "base64url"));
    const c = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
    c.setAAD(Buffer.from("github-app:" + user));
    c.setAuthTag(tag);
    return Buffer.concat([c.update(data), c.final()]).toString("utf8");
  } catch {
    throw githubError("GitHub connection needs to be authorized again.", 409);
  }
}
export function validWebhook(bytes, signature, secret) {
  if (
    !Buffer.isBuffer(bytes) ||
    !/^sha256=[a-f0-9]{64}$/.test(signature || "") ||
    !secret
  )
    return false;
  const actual = createHmac("sha256", secret).update(bytes).digest();
  return timingSafeEqual(actual, Buffer.from(signature.slice(7), "hex"));
}
export async function boundedJSON(response, max = 2097152) {
  const reader = response.body?.getReader();
  if (!reader) throw githubError("GitHub returned an empty response.");
  let size = 0;
  const parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max)
        throw githubError("GitHub response is too large. Open it on GitHub.");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw githubError("GitHub returned an unreadable response.");
  }
}
// No caller-controlled origin or redirects; tokens never enter URLs or clients.
export async function githubGET(path, token, { fetcher = fetch } = {}) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    throw githubError("Unsupported GitHub resource.", 400);
  const r = await fetcher("https://api.github.com" + path, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "Devdevian",
      Authorization: "Bearer " + token,
    },
    redirect: "manual",
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    await r.body?.cancel().catch(() => {});
    const error = githubError(
      r.status === 401
        ? "Reconnect your GitHub App account."
        : r.status === 404 || r.status === 403
          ? "GitHub resource is unavailable to your account and installed app."
          : "GitHub is temporarily unavailable. Try again later.",
      [403, 404].includes(r.status) ? r.status : r.status === 401 ? 409 : 503,
    );
    error.githubStatus = r.status;
    throw error;
  }
  return {
    data: await boundedJSON(r),
    hasNext: /rel="next"/.test(r.headers.get("link") || ""),
  };
}
export async function exchangeAppToken(body, config, { fetcher = fetch } = {}) {
  const r = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.id,
      client_secret: config.secret,
      ...body,
    }),
    redirect: "manual",
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw githubError("Could not authorize the GitHub App. Start again.", 409);
  const data = await boundedJSON(r, 32768);
  if (
    !/^ghu_[A-Za-z0-9_]+$/.test(data.access_token || "") ||
    !/^ghr_[A-Za-z0-9_]+$/.test(data.refresh_token || "") ||
    !Number.isSafeInteger(data.expires_in) ||
    data.expires_in < 60 ||
    data.expires_in > 86400 ||
    !Number.isSafeInteger(data.refresh_token_expires_in) ||
    data.refresh_token_expires_in < 60
  )
    throw githubError(
      "GitHub authorization expired or was denied. Connect again.",
      409,
    );
  return data;
}
// The transport accepts only these explicit read resources and query options.
export function allowedRead(input) {
  if (
    typeof input !== "string" ||
    input.length > 1800 ||
    !input.startsWith("/repos/") ||
    /[\\#]/.test(input)
  )
    throw githubError("Unsupported GitHub resource.", 400);
  const u = new URL(input, "https://api.github.com");
  const m = u.pathname.match(
    /^\/repos\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/(pulls(?:\/[1-9]\d{0,9}(?:\/files)?)?|issues|commits\/(?:[a-f0-9]{40}|[a-f0-9]{64})\/(?:check-runs|status))$/,
  );
  if (!m || [".", ".."].includes(m[2]) || u.origin !== "https://api.github.com")
    throw githubError("Unsupported GitHub resource.", 400);
  for (const [k, v] of u.searchParams) {
    if (
      u.searchParams.getAll(k).length !== 1 ||
      !["page", "per_page", "state", "sort", "direction"].includes(k) ||
      (k === "page" && !/^(?:[1-9]\d?|1[0-4]\d|150)$/.test(v)) ||
      (k === "per_page" && v !== "20") ||
      (k === "state" && !["open", "closed", "all"].includes(v)) ||
      (k === "sort" && !["updated", "created"].includes(v)) ||
      (k === "direction" && !["asc", "desc"].includes(v))
    )
      throw githubError("Unsupported GitHub query.", 400);
  }
  return {
    repository: `https://github.com/${m[1]}/${m[2]}`,
    repoPath: `/repos/${m[1]}/${m[2]}`,
    path: u.pathname + (u.search ? "?" + u.searchParams : ""),
    kind: m[3],
  };
}
