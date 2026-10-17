let themeFrame;
export const THEME_KEY = "devdevian-theme";

export function initialTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Theme switching still works when storage is unavailable. */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  if (themeFrame) window.cancelAnimationFrame?.(themeFrame);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0e1223" : "#f6f7fc");
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* Session-only fallback. */
  }
  if (window.requestAnimationFrame)
    themeFrame = window.requestAnimationFrame(() => {
      themeFrame = window.requestAnimationFrame(() =>
        root.classList.remove("theme-switching"),
      );
    });
  else root.classList.remove("theme-switching");
}
