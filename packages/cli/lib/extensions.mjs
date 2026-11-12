import { open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// Read only the explicitly selected, bounded package; never import or run it.
// The server remains authoritative for capabilities, CSS and listing validation.
export async function extensionPublication(file) {
  if (typeof file !== "string" || !file.endsWith(".devext.json"))
    throw Error(
      "Select a built .devext.json package using --file. Run extension:pack in the source repository first.",
    );
  const info = await lstat(resolve(file));
  if (!info.isFile() || info.isSymbolicLink())
    throw Error("Select a regular extension package, not a link or directory.");
  const handle = await open(
    resolve(file),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let bytes;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 256 * 1024)
      throw Error("Select a regular extension package of at most 256 KB.");
    // A fixed buffer also bounds a file that grows after stat().
    bytes = Buffer.alloc(256 * 1024 + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        size,
        bytes.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > 256 * 1024) throw Error("Extension package exceeds 256 KB.");
    bytes = bytes.subarray(0, size);
  } finally {
    await handle.close();
  }
  let pkg;
  try {
    pkg = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw Error("The package is not valid JSON. Build it with extension:pack.");
  }
  const m = pkg?.manifest;
  if (
    !pkg ||
    typeof pkg.name !== "string" ||
    typeof pkg.description !== "string" ||
    !/^[a-z][a-z0-9-]{2,47}$/.test(pkg.slug) ||
    !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
    m?.schema !== 2 ||
    m.kind !== "extension" ||
    !Array.isArray(m.permissions) ||
    m.permissions.some((p) => typeof p !== "string") ||
    !m.files ||
    typeof m.files !== "object" ||
    Array.isArray(m.files) ||
    Object.values(m.files).some((v) => typeof v !== "string") ||
    typeof m.files[m.entry] !== "string"
  )
    throw Error(
      "Use a built schema 2 code extension package, not devdevian.extension.json.",
    );
  const payload = Object.fromEntries(
    ["name", "slug", "version", "description", "manifest", "listing"]
      .filter((k) => pkg[k] !== undefined)
      .map((k) => [k, pkg[k]]),
  );
  return {
    payload,
    preview: {
      name: pkg.name,
      slug: pkg.slug,
      version: pkg.version,
      description: pkg.description,
      permissions: m.permissions,
      files: Object.keys(m.files),
      listing: pkg.listing || {},
      sha256: createHash("sha256").update(bytes).digest("hex"),
      audience:
        "PUBLIC extension library — all bundled sources and listing images will be public. Publication does not install or execute the extension.",
    },
  };
}
