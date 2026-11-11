import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { validatePackage } from "../extension-package.mjs";
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
    !/^[-a-z0-9]{3,64}$/.test(slug) ||
    !/^\d+\.\d+\.\d+$/.test(version) ||
    typeof description !== "string"
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
  const pkg = { name, slug, version, description, manifest };
  return {
    ...pkg,
    build: createHash("sha256").update(JSON.stringify(pkg)).digest("hex"),
  };
}
