(() => {
  let saved;
  try {
    saved = localStorage.getItem("devdevian-theme");
  } catch {}
  const theme =
    saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#0e1223" : "#f6f7fc";
})();
(() => {
  if (!/^\/docs(?:\/|$)/.test(location.pathname)) return;
  let theme = "dark",
    sidebar = "expanded";
  try {
    const saved = localStorage.getItem("devdevian-docs-theme");
    if (saved === "light" || saved === "dark") theme = saved;
    if (localStorage.getItem("devdevian-docs-sidebar") === "collapsed")
      sidebar = "collapsed";
  } catch {}
  document.documentElement.dataset.docsTheme = theme;
  document.documentElement.dataset.docsSidebar = sidebar;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#100a18" : "#fefbff");
})();
