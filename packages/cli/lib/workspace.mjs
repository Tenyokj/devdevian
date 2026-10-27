import { constants } from "node:fs";
import { readdir, realpath, lstat, open } from "node:fs/promises";
import { resolve, relative, join, isAbsolute, sep } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
const skipped = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  "target",
  "vendor",
]);
export const sensitivePath = (path) =>
  path
    .split(/[\\/]/)
    .some(
      (name) =>
        [".git", ".ssh", ".aws", ".gnupg", ".envrc"].includes(name.toLowerCase()) ||
        /^\.env(?:\.|$)/i.test(name) ||
        /\.(?:pem|key|p12|pfx|keystore)$/i.test(name) ||
        /^(?:id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?|credentials(?:\.json)?|\.npmrc|\.netrc|\.git-credentials)$/i.test(
          name,
        ),
    );
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function workspaceRoot(path = process.cwd()) {
  const root = await realpath(resolve(path));
  if (!(await lstat(root)).isDirectory())
    throw Error("Choose a project directory.");
  return root;
}
export async function workspacePath(root, path = ".") {
  const candidate = resolve(root, path),
    rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
    throw Error("Stay inside the selected project directory.");
  // Refuse symlinks at every segment, including links pointing back into the project.
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink())
      throw Error("Symbolic links are not opened by the file picker.");
  }
  if (sensitivePath(rel))
    throw Error(
      "Environment files and credential/key files are excluded from code selection.",
    );
  return candidate;
}
async function git(root, args, { input, signal, max = 1024 * 1024 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "git",
      [
        "--no-pager",
        ...(args[0] === "diff" ? ["--literal-pathspecs"] : []),
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotepath=false",
        "-C",
        root,
        ...args,
      ],
      {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
        },
      },
    );
    const chunks = [];
    let length = 0,
      error = "",
      failure;
    const stop = (reason) => {
      failure = reason;
      child.kill();
    };
    const timer = setTimeout(
      () => stop(Error("Git took too long. Try a smaller project.")),
      8000,
    );
    const abort = () => stop(Error("Git selection cancelled."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on("data", (chunk) => {
      length += chunk.length;
      if (length > max)
        stop(
          Error(
            "Git output is too large. Narrow the changes before selecting them.",
          ),
        );
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (error.length < 1000) error += chunk.toString();
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.once("error", (e) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (e.code === "ENOENT") {
        const missing = Error("Install Git to select project changes.");
        missing.gitMissing = true;
        reject(missing);
      } else reject(e);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) {
        const e = Error(
          /not a git repository/i.test(error)
            ? "This project is not inside a Git repository."
            : "Git could not read these changes.",
        );
        e.gitCode = code;
        reject(e);
      } else resolvePromise(Buffer.concat(chunks).toString("utf8"));
    });
  });
}
export async function listFiles(
  root,
  directory = ".",
  { hidden = false, query = "", signal } = {},
) {
  const path = await workspacePath(root, directory),
    entries = await readdir(path, { withFileTypes: true });
  if (entries.length > 5000)
    throw Error(
      "This directory has too many entries. Choose a smaller project directory.",
    );
  const candidates = entries.filter(
    (e) =>
      !e.isSymbolicLink() &&
      (e.isDirectory() || e.isFile()) &&
      !skipped.has(e.name) &&
      (!e.name.startsWith(".") || hidden) &&
      !sensitivePath(join(directory, e.name)),
  );
  let ignored = new Set();
  if (candidates.length) {
    try {
      const output = await git(
        root,
        ["check-ignore", "--no-index", "-z", "--stdin"],
        {
          input:
            candidates
              .map(
                (e) =>
                  "./" +
                  relative(root, join(path, e.name)).split(sep).join("/") +
                  (e.isDirectory() ? "/" : ""),
              )
              .join("\0") + "\0",
          signal,
        },
      );
      ignored = new Set(
        output.split("\0").map((path) => path.replace(/^\.\//, "")),
      );
    } catch (e) {
      if (signal?.aborted) throw e;
      if (
        !e.gitMissing &&
        e.gitCode !== 1 &&
        e.message !== "This project is not inside a Git repository."
      )
        throw e;
    }
  }
  return candidates
    .filter(
      (e) =>
        !ignored.has(
          relative(root, join(path, e.name)).split(sep).join("/") +
            (e.isDirectory() ? "/" : ""),
        ) && e.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name),
    )
    .map((e) => ({
      name: e.name,
      path: relative(root, join(path, e.name)),
      directory: e.isDirectory(),
    }));
}
export async function readCodeFile(root, path) {
  const filename = await workspacePath(root, path);
  if (!(await lstat(filename)).isFile())
    throw Error("Choose a regular text file.");
  const file = await open(
    filename,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0),
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 512 * 1024)
      throw Error(
        "Choose a text file up to 512 KiB; publish up to 20,000 characters.",
      );
    // Bound allocation even if a generator appends to this file during selection.
    const buffer = Buffer.alloc(512 * 1024 + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 512 * 1024)
      throw Error("The selected file grew beyond the preview limit.");
    const code = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, length),
    );
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(code))
      throw Error("Binary/control data cannot be selected as code.");
    return {
      code: code.replace(/\r\n/g, "\n"),
      path: relative(root, filename),
    };
  } catch (e) {
    if (e instanceof TypeError) throw Error("Choose a UTF-8 text file.");
    throw e;
  } finally {
    await file.close();
  }
}
export function selectLines(code, start = 1, end = code.split("\n").length) {
  const lines = code.split("\n");
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end > lines.length
  )
    throw Error("Choose an existing line range.");
  const selected = lines.slice(start - 1, end).join("\n");
  if (selected.trim().length < 10 || selected.length > 20000)
    throw Error("Select between 10 and 20,000 characters of code.");
  return selected;
}
const diffArgs = (staged) => [
  "diff",
  "--no-ext-diff",
  "--no-textconv",
  "--no-color",
  "--no-renames",
  "--ignore-submodules=all",
  "--relative",
  ...(staged ? ["--cached"] : []),
];
export async function listChanges(
  root,
  { staged = false, query = "", signal } = {},
) {
  const output = await git(
    root,
    [...diffArgs(staged), "--numstat", "-z", "--", "."],
    { signal },
  );
  const entries = output
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const first = line.indexOf("\t"),
        second = line.indexOf("\t", first + 1);
      return {
        path: line.slice(second + 1),
        added: line.slice(0, first),
        removed: line.slice(first + 1, second),
      };
    });
  const safe = [];
  for (const entry of entries) {
    if (
      entry.added === "-" ||
      (entry.added === "0" && entry.removed === "0") ||
      sensitivePath(entry.path) ||
      entry.path.split("/").some((p) => skipped.has(p))
    )
      continue;
    try {
      await workspacePath(root, entry.path);
    } catch (e) {
      if (e.code !== "ENOENT")
        continue; /* Deleted files still have reviewable patches. */
    }
    if (entry.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      safe.push({ ...entry, name: entry.path, directory: false });
  }
  return safe;
}
export function splitPatch(patch) {
  const lines = patch.split("\n"),
    starts = [];
  for (let i = 0; i < lines.length; i++)
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(lines[i])) starts.push(i);
  if (!starts.length)
    throw Error(
      "No text changes to review. Binary files and submodules are not supported.",
    );
  const header = lines.slice(0, starts[0]);
  return starts.map((start, index) => {
    const text = [
      ...header,
      ...lines.slice(start, starts[index + 1] ?? lines.length),
    ].join("\n");
    return { index, label: lines[start], patch: text, hash: hash(text) };
  });
}
export async function readDiff(root, path, { staged = false, signal } = {}) {
  if (sensitivePath(path)) throw Error("Credential files cannot be selected.");
  // Deleted paths cannot be resolved, but their existing parents must still stay in the workspace.
  const candidate = resolve(root, path),
    rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
    throw Error("Stay inside the selected project directory.");
  try {
    await workspacePath(root, path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const patch = await git(
    root,
    [...diffArgs(staged), "--unified=3", "--", path],
    { signal },
  );
  return { path, staged, patch, hash: hash(patch), hunks: splitPatch(patch) };
}
export async function reviewSource(root, source, { signal } = {}) {
  if (source.kind === "diff") {
    const diff = await readDiff(root, source.path, {
        staged: source.staged,
        signal,
      }),
      part = source.hunk === null ? diff : diff.hunks[source.hunk];
    if (!part || part.hash !== source.hash)
      throw Error(
        "These Git changes have changed since selection. Open the picker and select them again.",
      );
    const code = selectLines(part.patch);
    return {
      code,
      label: `Git diff · ${source.staged ? "staged" : "unstaged"} · ${source.path}${source.hunk === null ? "" : " · " + part.label}`,
      kind: "diff",
    };
  }
  const file = await readCodeFile(root, source.path),
    code = selectLines(
      file.code,
      source.start || 1,
      source.end || file.code.split("\n").length,
    );
  return {
    code,
    label: `File · ${file.path}${source.start ? " · lines " + source.start + "–" + source.end : ""}`,
    kind: "file",
  };
}
