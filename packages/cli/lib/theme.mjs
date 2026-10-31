import { createContext, useContext } from "react";
import { normalizeAppearance } from "./appearance.mjs";
const presets = {
  midnight: {
    bg: "#0b1020",
    panel: "#11182b",
    line: "#303d60",
    muted: "#96a3c1",
    text: "#e5eaff",
    green: "#7bdcbd",
    red: "#ffa0b4",
    selected: "#29365b",
  },
  nebula: {
    bg: "#100d20",
    panel: "#1a1530",
    line: "#4a3b68",
    muted: "#a49ab9",
    text: "#f0eaff",
    green: "#86ddc3",
    red: "#ffa6bd",
    selected: "#3c2c59",
  },
  halloween: {
    bg: "#130f12",
    panel: "#1d1618",
    line: "#705339",
    muted: "#c4ae94",
    text: "#fff1dc",
    green: "#9ed6b1",
    red: "#ff9e9c",
    selected: "#38291f",
  },
  daylight: {
    bg: "#f2f5ff",
    panel: "#ffffff",
    line: "#b4c0dc",
    muted: "#53617a",
    text: "#1b2440",
    green: "#16634d",
    red: "#a12444",
    selected: "#dce5ff",
  },
  contrast: {
    bg: "#000000",
    panel: "#080e1c",
    line: "#899cc6",
    muted: "#becae2",
    text: "#ffffff",
    green: "#8cf4c7",
    red: "#ffb0c4",
    selected: "#24345c",
  },
};
export function themeFor(value = {}) {
  const settings = normalizeAppearance(value),
    light = settings.theme === "daylight";
  const accents = light
    ? {
        blue: ["#3154b8", "#6b36b6"],
        violet: ["#6b36b6", "#3154b8"],
        cyan: ["#006b80", "#6b36b6"],
        rose: ["#9b246c", "#3154b8"],
        orange: ["#8c4000", "#6b36b6"],
      }
    : {
        blue: ["#86baff", "#b5a0ff"],
        violet: ["#c0a6ff", "#86baff"],
        cyan: ["#74d5ed", "#b5a0ff"],
        rose: ["#f4a6cf", "#86baff"],
        orange: ["#ffb86b", "#e6cb85"],
      };
  const [blue, purple] =
    accents[
      settings.theme === "halloween" && settings.accent === "blue"
        ? "orange"
        : settings.accent
    ];
  return {
    ...presets[settings.theme],
    blue,
    purple,
    frame: settings.frame,
    seasonal: settings.theme === "halloween",
  };
}
export const colors = Object.freeze(themeFor());
export const ThemeContext = createContext(colors);
export const useTheme = () => useContext(ThemeContext);
