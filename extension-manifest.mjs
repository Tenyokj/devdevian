// Shared by server and browser. Extensions v1 are data, never executable code.
export const paletteKeys = [
  "canvas",
  "surface",
  "surfaceSoft",
  "text",
  "secondary",
  "muted",
  "line",
  "accent",
  "accentSoft",
  "accentLine",
  "sidebar",
  "code",
];
export const tokenNames = {
  canvas: "--canvas",
  surface: "--surface",
  surfaceSoft: "--surface-soft",
  text: "--text",
  secondary: "--text-secondary",
  muted: "--text-muted",
  line: "--line",
  accent: "--accent",
  accentSoft: "--accent-soft",
  accentLine: "--accent-line",
  sidebar: "--sidebar",
  code: "--code-bg",
};
const plain = (x) =>
  x &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const exact = (x, keys) =>
  plain(x) &&
  Object.keys(x).length === keys.length &&
  keys.every((k) => Object.hasOwn(x, k));
export function contrast(a, b) {
  const light = (s) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const x = light(a),
    y = light(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validateManifest(value) {
  if (
    !exact(value, ["schema", "kind", "mode", "font", "corners", "palette"]) ||
    value.schema !== 1 ||
    value.kind !== "theme" ||
    !["dark", "light"].includes(value.mode) ||
    !["default", "mono", "system"].includes(value.font) ||
    !["round", "soft", "square"].includes(value.corners) ||
    !exact(value.palette, paletteKeys)
  )
    throw Error("Use a schema 1 theme with the documented fields only.");
  for (const key of paletteKeys)
    if (
      typeof value.palette[key] !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(value.palette[key])
    )
      throw Error("Palette values must be six-digit hex colors.");
  const p = value.palette;
  if (contrast("#edf0fb", p.code) < 4.5)
    throw Error("Code backgrounds must keep light code text readable (4.5:1).");
  for (const background of ["canvas", "surface", "surfaceSoft", "sidebar"])
    if (contrast(p.muted, p[background]) < 3)
      throw Error("Muted text needs at least 3:1 contrast.");
  for (const background of ["canvas", "surface", "surfaceSoft", "sidebar"])
    if (
      contrast(p.text, p[background]) < 4.5 ||
      contrast(p.secondary, p[background]) < 4.5
    )
      throw Error(
        "Text and secondary text need at least 4.5:1 contrast on all reading surfaces.",
      );
  for (const background of ["canvas", "surface", "surfaceSoft", "accentSoft"])
    if (contrast(p.accent, p[background]) < 3)
      throw Error("Accent needs at least 3:1 contrast on reading surfaces.");
  return {
    schema: 1,
    kind: "theme",
    mode: value.mode,
    font: value.font,
    corners: value.corners,
    palette: Object.fromEntries(
      paletteKeys.map((k) => [k, p[k].toLowerCase()]),
    ),
  };
}
export function themeTokens(manifest) {
  const m = validateManifest(manifest),
    p = m.palette;
  const rgb = p.accent
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16))
    .join(", ");
  return {
    ...Object.fromEntries(paletteKeys.map((k) => [tokenNames[k], p[k]])),
    "--extension-on-accent":
      contrast("#ffffff", p.accent) >= contrast("#000000", p.accent)
        ? "#ffffff"
        : "#000000",
    "--accent-rgb": rgb,
    "--accent-hover": p.accent,
    "--lime": p.accent,
    "--extension-font":
      m.font === "mono"
        ? "ui-monospace, SFMono-Regular, monospace"
        : m.font === "system"
          ? "system-ui, sans-serif"
          : "Manrope, sans-serif",
    "--extension-radius":
      m.corners === "round" ? "24px" : m.corners === "soft" ? "12px" : "4px",
  };
}
function make(id, name, summary, mode, accent, base) {
  const palette =
    mode === "dark"
      ? {
          canvas: base,
          surface: "#1a1d29",
          surfaceSoft: "#141721",
          text: "#f4f5fc",
          secondary: "#c4c8d9",
          muted: "#a5abc2",
          line: "#34394e",
          accent,
          accentSoft: "#262938",
          accentLine: accent,
          sidebar: base,
          code: "#10131c",
        }
      : {
          canvas: "#fff9ed",
          surface: "#fffdf7",
          surfaceSoft: "#fff5df",
          text: "#272319",
          secondary: "#625744",
          muted: "#71644d",
          line: "#e2d3af",
          accent,
          accentSoft: "#f6e5bc",
          accentLine: accent,
          sidebar: "#fff5df",
          code: "#171b27",
        };
  return {
    id,
    name,
    slug: id,
    version: "1.0.0",
    description: summary,
    author: { name: "Devdevian", username: null },
    review: "reviewed",
    builtin: true,
    manifest: validateManifest({
      schema: 1,
      kind: "theme",
      mode,
      font: "default",
      corners: "round",
      palette,
    }),
  };
}
export const builtinThemes = [
  make(
    "devi-violet",
    "Devi Violet",
    "A familiar violet workspace with a deeper night palette.",
    "dark",
    "#baa9ff",
    "#10101e",
  ),
  make(
    "amber-night",
    "Amber Night",
    "Warm amber highlights for late-night building.",
    "dark",
    "#ffd079",
    "#16130e",
  ),
  make(
    "mint-terminal",
    "Mint Terminal",
    "Cool mint accents and a calm terminal-inspired canvas.",
    "dark",
    "#8ce9cb",
    "#0e1817",
  ),
  make(
    "solar-paper",
    "Solar Paper",
    "A warm, light workspace with ochre details.",
    "light",
    "#795309",
    "#fff9ed",
  ),
];
