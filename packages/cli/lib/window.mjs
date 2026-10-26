import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const shellQuote = (value) =>
  "'" + String(value).replaceAll("'", "'\\''") + "'";
export function macScript({ node, entry, args = [], cwd, env = {} }) {
  const selected = ["DEVDEVIAN_CONFIG_DIR", "NO_COLOR"]
    .filter((key) => env[key])
    .map((key) => `${key}=${shellQuote(env[key])} `)
    .join("");
  return `#!/bin/sh\ncd -- ${shellQuote(cwd)} || exit 1\n${selected}${[node, entry, "tui", ...args].map(shellQuote).join(" ")}\nresult=$?\nrm -f -- "$0"\nrmdir -- "$(dirname -- "$0")" 2>/dev/null\nexit "$result"\n`;
}
const available = (command) =>
  spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    stdio: "ignore",
    shell: false,
  }).status === 0;
export async function openWindow({
  entry,
  args = [],
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  node = process.execPath,
} = {}) {
  let command, argv, temporary;
  if (platform === "darwin") {
    temporary = await mkdtemp(join(tmpdir(), "devdevian-window-"));
    const script = join(temporary, "Devdevian.command");
    await writeFile(script, macScript({ node, entry, args, cwd, env }), {
      mode: 0o700,
    });
    command = "open";
    argv = ["-na", "Terminal", script];
  } else if (platform === "win32") {
    if (!available("wt.exe"))
      throw Error(
        "Windows Terminal (wt.exe) is required for a separate window. Run devdevian tui in the current terminal instead.",
      );
    command = "wt.exe";
    argv = [
      "-w",
      "new",
      "new-tab",
      "--startingDirectory",
      cwd,
      node,
      entry,
      "tui",
      ...args,
    ];
  } else {
    if (!env.DISPLAY && !env.WAYLAND_DISPLAY)
      throw Error(
        "A graphical session is needed for a new window. Over SSH, run devdevian tui in your current terminal.",
      );
    if (available("gnome-terminal")) {
      command = "gnome-terminal";
      argv = ["--working-directory", cwd, "--", node, entry, "tui", ...args];
    } else if (available("konsole")) {
      command = "konsole";
      argv = [
        "--separate",
        "--workdir",
        cwd,
        "-e",
        node,
        entry,
        "tui",
        ...args,
      ];
    } else if (available("xterm")) {
      command = "xterm";
      argv = ["-T", "Devdevian", "-e", node, entry, "tui", ...args];
    } else
      throw Error(
        "Install GNOME Terminal, Konsole or xterm, or run devdevian tui in your current terminal.",
      );
  }
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, argv, {
        cwd,
        env,
        stdio: "ignore",
        detached: true,
        shell: false,
      });
      // Launchers may spawn successfully and still reject the requested application.
      const launcherExits = platform === "darwin" || platform === "win32";
      const timer = setTimeout(
        () => {
          if (launcherExits) {
            child.kill();
            reject(Error("Terminal launcher timed out."));
          } else {
            child.unref();
            resolve();
          }
        },
        launcherExits ? 10000 : 1500,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error("Terminal launcher failed."));
      });
    });
  } catch {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    throw Error(
      "Could not open a terminal window. Run devdevian tui in your current terminal.",
    );
  }
}
