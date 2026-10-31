import { dirname, join } from "node:path";
import {
  mkdir,
  lstat,
  open,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { randomBytes } from "node:crypto";
import { configFile } from "./client.mjs";

export const appearanceFields = [
  {
    key: "theme",
    label: "Theme",
    options: [
      ["midnight", "Midnight · original"],
      ["nebula", "Nebula · deep violet"],
      ["daylight", "Daylight · light"],
      ["contrast", "Contrast · high contrast"],
      ["halloween", "Halloween · pumpkin glow"],
    ],
  },
  {
    key: "accent",
    label: "Accent",
    options: [
      ["blue", "Blue"],
      ["violet", "Violet"],
      ["cyan", "Cyan"],
      ["rose", "Rose"],
      ["orange", "Orange"],
    ],
  },
  {
    key: "density",
    label: "List density",
    options: [
      ["comfortable", "Comfortable"],
      ["compact", "Compact"],
    ],
  },
  {
    key: "sidebar",
    label: "Navigation",
    options: [
      ["auto", "Sidebar on wide terminals"],
      ["hidden", "Hidden · Tab opens navigation"],
    ],
  },
  {
    key: "reviewLayout",
    label: "Review panels",
    options: [
      ["auto", "Side by side when space allows"],
      ["stacked", "One panel · W switches"],
    ],
  },
  {
    key: "frame",
    label: "Frames",
    options: [
      ["round", "Rounded"],
      ["single", "Straight"],
    ],
  },
  {
    key: "motion",
    label: "Motion",
    options: [
      ["subtle", "Subtle loading indicators"],
      ["reduced", "Reduced · static indicators"],
    ],
  },
  {
    key: "welcome",
    label: "Devi greeting",
    options: [
      ["on", "Show Devi"],
      ["off", "Hide Devi"],
    ],
  },
];
export const defaultAppearance = Object.freeze(
  Object.fromEntries(
    appearanceFields.map((field) => [field.key, field.options[0][0]]),
  ),
);
export function normalizeAppearance(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Appearance settings must be an object.");
  for (const key of Object.keys(value))
    if (!appearanceFields.some((field) => field.key === key))
      throw Error("Unknown appearance option: " + key);
  const settings = { ...defaultAppearance, ...value };
  for (const field of appearanceFields)
    if (!field.options.some(([id]) => id === settings[field.key]))
      throw Error(
        `Invalid ${field.key}. Choose: ${field.options.map(([id]) => id).join(", ")}.`,
      );
  return settings;
}
export function appearanceFlags(flags) {
  const updates = {};
  for (const field of appearanceFields) {
    const flag = field.key === "reviewLayout" ? "review-layout" : field.key;
    if (flags[flag] !== undefined) updates[field.key] = flags[flag];
  }
  normalizeAppearance(updates);
  return updates;
}
export const appearanceFile = (env = process.env) =>
  join(dirname(configFile(env)), "appearance.json");
async function safeDirectory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw Error("The appearance directory must be a real directory.");
}
export async function loadAppearance(env = process.env) {
  const file = appearanceFile(env);
  try {
    await safeDirectory(dirname(file));
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096)
      throw Error("Invalid appearance file.");
    const handle = await open(
      file,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW || 0) |
        (constants.O_NONBLOCK || 0),
    );
    let record;
    try {
      if (!(await handle.stat()).isFile())
        throw Error("Invalid appearance file.");
      const bytes = Buffer.alloc(4097),
        { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 4096) throw Error("Appearance file is too large.");
      record = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, bytesRead),
        ),
      );
    } finally {
      await handle.close();
    }
    if (
      record.version !== 1 ||
      !record.settings ||
      typeof record.settings !== "object"
    )
      throw Error("Unsupported appearance file version.");
    return { settings: normalizeAppearance(record.settings), warning: "" };
  } catch (error) {
    return {
      settings: { ...defaultAppearance },
      warning:
        error.code === "ENOENT"
          ? ""
          : "Could not load appearance settings. Using defaults; /appearance can save a fresh configuration.",
    };
  }
}
export async function saveAppearance(value, env = process.env) {
  const settings = normalizeAppearance(value),
    file = appearanceFile(env),
    directory = dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await safeDirectory(directory);
  const temporary = join(
    directory,
    ".appearance-" + randomBytes(12).toString("hex"),
  );
  try {
    await writeFile(
      temporary,
      JSON.stringify({ version: 1, settings }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return settings;
}
