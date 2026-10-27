import { spawn } from "node:child_process";
import { mkdtemp, writeFile, open, rm, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Parse argv, never shell code. Quoting supports editor paths and --wait flags.
export function editorArgs(command) {
  const args = [];
  let value = "",
    quote = null,
    started = false;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else value += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) {
        args.push(value);
        value = "";
        started = false;
      }
    } else {
      value += char;
      started = true;
    }
  }
  if (quote) throw Error("Close the quote in VISUAL / EDITOR.");
  if (started) args.push(value);
  if (!args[0])
    throw Error(
      "Set VISUAL or EDITOR to an editor command (for example: code --wait).",
    );
  return args;
}
export async function editExternal(
  initial,
  {
    max = 15000,
    command = process.env.VISUAL ||
      process.env.EDITOR ||
      (process.platform === "win32" ? "notepad" : "vi"),
  } = {},
) {
  const [executable, ...args] = editorArgs(command);
  const directory = await mkdtemp(join(tmpdir(), "devdevian-editor-")),
    file = join(directory, "message.md");
  try {
    await writeFile(file, initial, { mode: 0o600, flag: "wx" });
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [...args, file], {
        stdio: "inherit",
        shell: false,
      });
      child.once("error", () =>
        reject(
          Error(
            "Could not start the editor. Check VISUAL / EDITOR; your original text is unchanged.",
          ),
        ),
      );
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              Error(
                "Editor cancelled or failed; your original text is unchanged.",
              ),
            ),
      );
    });
    const infoBeforeOpen = await lstat(file);
    if (infoBeforeOpen.isSymbolicLink() || !infoBeforeOpen.isFile())
      throw Error("Editor output must be a regular file. Original text kept.");
    const handle = await open(
      file,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW || 0) |
        (constants.O_NONBLOCK || 0),
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > max * 4)
        throw Error(
          `Editor output must be a UTF-8 text file with at most ${max} characters. Original text kept.`,
        );
      const buffer = Buffer.alloc(max * 4 + 1),
        { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, bytesRead),
        );
      } catch {
        throw Error("Editor output must be UTF-8. Original text kept.");
      }
      if (bytesRead > max * 4 || text.length > max || text.includes("\0"))
        throw Error(
          `Editor output exceeds ${max} characters or contains binary data. Original text kept.`,
        );
      return text.replace(/\r\n/g, "\n");
    } finally {
      await handle.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
