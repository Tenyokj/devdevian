import { validateListing } from "./sdk/listing.mjs";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { validatePackage } from "./sdk/package.mjs";
// Only explicitly imported local sources are packaged; never scan a user's repo.
export async function buildExtension(directory) {
  const root = await realpath(resolve(directory));
  const inside = async (name) => {
    const file = await realpath(resolve(root, name));
    const rel = relative(root, file);
    if (
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      /(^|\/)(?:\.env[^/]*|node_modules|\.git)(\/|$)/.test(rel)
    )
      throw Error(
        "Extension inputs must stay inside its directory, excluding secrets and dependencies.",
      );
    const info = await stat(file);
    if (!info.isFile() || info.size > 196608)
      throw Error(
        "Each extension input must be a regular file of at most 192 KB.",
      );
    return file;
  };
  const config = JSON.parse(
    await readFile(await inside("devdevian.extension.json"), "utf8"),
  );
  const {
    name,
    slug,
    version,
    description,
    entry,
    styles = {},
    permissions = [],
  } = config;
  if (
    typeof name !== "string" ||
    !/^[a-z][a-z0-9-]{2,47}$/.test(slug) ||
    !/^\d+\.\d+\.\d+$/.test(version) ||
    typeof description !== "string" ||
    name.trim().length < 3 ||
    name.length > 60 ||
    description.trim().length < 20 ||
    description.length > 1200 ||
    typeof entry !== "string"
  )
    throw Error(
      "Set name, slug, semantic version and description in devdevian.extension.json.",
    );
  const result = await build({
    entryPoints: [await inside(entry)],
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    logLevel: "silent",
    metafile: true,
    plugins: [
      {
        name: "local-inputs",
        setup(b) {
          b.onLoad({ filter: /.*/ }, async (args) => {
            await inside(args.path);
            return undefined;
          });
        },
      },
    ],
  });
  const files = { "main.js": result.outputFiles[0].text };
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = await inside(input),
      rel = relative(root, file);
    files["sources/" + rel] = await readFile(file, "utf8");
  }
  const css = {};
  for (const mode of ["light", "dark"]) {
    css[mode] = styles[mode]
      ? await readFile(await inside(styles[mode]), "utf8")
      : "";
    if (styles[mode]) files["sources/" + styles[mode]] = css[mode];
  }
  const manifest = validatePackage({
    schema: 2,
    kind: "extension",
    permissions,
    entry: "main.js",
    files,
    styles: css,
  });
  const pkg = {
    name,
    slug,
    version,
    description,
    manifest,
    listing: validateListing(config.listing),
  };
  if (Buffer.byteLength(JSON.stringify(pkg), "utf8") > 262144)
    throw Error("The package including its listing must fit within 256 KB.");
  return {
    ...pkg,
    build: createHash("sha256").update(JSON.stringify(pkg)).digest("hex"),
  };
}
