import { buildExtension } from "./extension-build.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const directory = process.argv[2];
if (!directory)
  throw Error(
    "Usage: npm run extension:pack -- path/to/extension [output.devext.json]",
  );
const { build, ...pkg } = await buildExtension(directory);
const output = resolve(
  process.argv[3] || `${directory}/dist/${pkg.slug}-${pkg.version}.devext.json`,
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(pkg, null, 2));
console.log(`Built ${output}`);
