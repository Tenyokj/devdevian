import {
  readFile,
  writeFile,
  mkdir,
  chmod,
  rename,
  unlink,
  lstat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
export function originOf(value) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw Error(
      "Use an HTTPS server origin, or HTTP on loopback for local development.",
    );
  return url.origin;
}
export const clean = (value) =>
  String(value ?? "")
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "");
export function configFile(env = process.env) {
  return join(
    env.DEVDEVIAN_CONFIG_DIR || join(homedir(), ".config", "devdevian"),
    "credentials.json",
  );
}
export async function loadConfig() {
  try {
    const path = configFile(),
      info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw Error("The credentials path must be a regular file.");
    if (process.platform !== "win32" && info.mode & 0o077)
      throw Error(
        "Credentials permissions are too broad. Run chmod 600 on " + path,
      );
    const config = JSON.parse(await readFile(path, "utf8"));
    config.origin = originOf(config.origin);
    if (!/^ddv_[A-Za-z0-9_-]{43}$/.test(config.token || ""))
      throw Error("Invalid saved CLI credentials. Sign in again.");
    return config;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export async function saveConfig(config) {
  const file = configFile(),
    dir = join(file, "..");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (info.isSymbolicLink() || !info.isDirectory())
    throw Error("The credentials directory must be a real directory.");
  const temp = join(dir, ".credentials-" + randomBytes(8).toString("hex"));
  try {
    await writeFile(temp, JSON.stringify(config) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await chmod(temp, 0o600);
    await rename(temp, file);
  } finally {
    await unlink(temp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export async function removeConfig() {
  try {
    await unlink(configFile());
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
export function client(origin, token = null) {
  origin = originOf(origin);
  return async (path, { method = "GET", body } = {}) => {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw Error("Invalid API path.");
    let response;
    try {
      response = await fetch(origin + "/api" + path, {
        method,
        redirect: "error",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw Error(
        "Could not reach Devdevian. Check your connection and server address.",
      );
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024)
        throw Error("Devdevian response is too large. Use a smaller page.");
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Error(
        `Devdevian returned an unexpected response (HTTP ${response.status}). Try again later.`,
      );
    }
    if (!response.ok) {
      const error = Error(
        clean(data.error || `Request failed (HTTP ${response.status}).`),
      );
      error.status = response.status;
      throw error;
    }
    return data;
  };
}
