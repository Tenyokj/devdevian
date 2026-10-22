import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
// Use the worker pool: password checks must not block unrelated forum reads.
export async function encodePassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derive(password, salt, 64)).toString("hex");
}
export async function checkPassword(password, encoded) {
  const valid =
    typeof encoded === "string" && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded);
  // Legacy local accounts used non-hex salts. Accept their bounded format too.
  const parts = typeof encoded === "string" ? encoded.split(":") : [];
  const legacy =
    parts.length === 2 &&
    parts[0].length > 0 &&
    parts[0].length <= 128 &&
    /^[a-f0-9]{128}$/.test(parts[1]);
  const [salt, hash] =
    valid || legacy ? parts : ["0".repeat(32), "0".repeat(128)];
  const result = await derive(password, salt, 64);
  return (
    timingSafeEqual(result, Buffer.from(hash, "hex")) && !!(valid || legacy)
  );
}
