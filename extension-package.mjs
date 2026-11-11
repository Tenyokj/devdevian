import * as css from "css-tree";
export const packagePermissions = [
  "ui.style",
  "ui.layout",
  "ui.panel",
  "ui.navigate",
  "views.open",
  "storage",
  "data.read",
];
const object = (x) =>
  x &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
export function networkOrigins(permissions) {
  return permissions
    .filter((x) => x.startsWith("network:"))
    .map((x) => x.slice(8));
}
function origin(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.origin === value &&
      /^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname) &&
      !/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)
    );
  } catch {
    return false;
  }
}
export function scopedStyles(source) {
  if (
    typeof source !== "string" ||
    source.length > 24576 ||
    /[\\\u0000]/.test(source)
  )
    throw Error(
      "Host CSS is limited to 24 KB and cannot use escapes or null bytes.",
    );
  const ast = css.parse(source, {
    parseCustomProperty: true,
    onParseError: (e) => {
      throw e;
    },
  });
  css.walk(ast, (node) => {
    if (
      node.type === "Raw" ||
      node.type === "Url" ||
      (node.type === "Function" &&
        /^(url|image|image-set|-webkit-image-set|paint|element|src)$/i.test(
          node.name,
        ))
    )
      throw Error(
        "Host styles cannot load resources. Put asset rendering inside your extension panel.",
      );
    if (
      node.type === "Atrule" &&
      !["media", "supports"].includes(node.name.toLowerCase())
    )
      throw Error("Host CSS supports rules, @media and @supports only.");
    if (node.type === "NestingSelector")
      throw Error(
        "Expand CSS nesting into ordinary selectors before packaging.",
      );
    if (node.type === "Rule") {
      if (node.prelude?.type !== "SelectorList")
        throw Error("Use standard CSS selectors.");
      const selectors = [];
      node.prelude.children.forEach((selector) => {
        const parts = selector.children.toArray();
        const first = parts[0];
        const root =
          first &&
          ((first.type === "PseudoClassSelector" && first.name === "root") ||
            (first.type === "TypeSelector" &&
              ["html", "body"].includes(first.name)) ||
            (first.type === "ClassSelector" && first.name === "app"));
        if (root) {
          parts.shift();
          const combinator = parts.find((x) => x.type === "Combinator");
          if (combinator && ![" ", ">"].includes(combinator.name))
            throw Error("Root styles cannot select siblings outside the app.");
          selectors.push(
            ".devext-surface" + parts.map((x) => css.generate(x)).join(""),
          );
        } else selectors.push(".devext-surface " + css.generate(selector));
      });
      node.prelude = css.parse(selectors.join(","), {
        context: "selectorList",
      });
    }
  });
  return css.generate(ast);
}
export function validatePackage(m) {
  if (
    !object(m) ||
    m.schema !== 2 ||
    m.kind !== "extension" ||
    Object.keys(m).some(
      (k) =>
        !["schema", "kind", "permissions", "entry", "files", "styles"].includes(
          k,
        ),
    )
  )
    throw Error("Use a schema 2 extension package.");
  if (
    !Array.isArray(m.permissions) ||
    m.permissions.length > 12 ||
    new Set(m.permissions).size !== m.permissions.length ||
    m.permissions.some(
      (p) =>
        typeof p !== "string" ||
        (!packagePermissions.includes(p) &&
          !(p.startsWith("network:") && origin(p.slice(8)))),
    )
  )
    throw Error(
      "Declare supported capabilities and exact HTTPS network origins.",
    );
  if (
    !object(m.files) ||
    Object.keys(m.files).length > 32 ||
    !Object.keys(m.files).length ||
    m.entry !== "main.js" ||
    typeof m.files[m.entry] !== "string" ||
    !m.files[m.entry].trim()
  )
    throw Error(
      "Package needs a bundled main.js entry and at most 32 source files.",
    );
  for (const [name, body] of Object.entries(m.files))
    if (
      !/^[a-zA-Z0-9_/-]+\.(js|ts|tsx|jsx|css|html|json|svg|md)$/.test(name) ||
      name.includes("..") ||
      name.startsWith("/") ||
      name.split("/").includes("__proto__") ||
      typeof body !== "string" ||
      body.includes("\u0000")
    )
      throw Error("Invalid source path or contents.");
  if (
    !object(m.styles) ||
    Object.keys(m.styles).some((k) => !["light", "dark"].includes(k)) ||
    !["light", "dark"].every((k) => typeof m.styles[k] === "string")
  )
    throw Error("Provide light and dark host CSS (empty strings are allowed).");
  for (const s of Object.values(m.styles)) {
    scopedStyles(s);
    if (s.trim() && !m.permissions.includes("ui.style"))
      throw Error("Host CSS requires ui.style.");
  }
  if (new TextEncoder().encode(JSON.stringify(m)).length > 196608)
    throw Error(
      "Package exceeds 192 KB. Bundle/minify dependencies and omit unused sources.",
    );
  return JSON.parse(
    JSON.stringify({
      schema: 2,
      kind: "extension",
      permissions: m.permissions,
      entry: "main.js",
      files: m.files,
      styles: m.styles,
    }),
  );
}
export function layoutCSS(layout) {
  if (
    !object(layout) ||
    Object.keys(layout).some(
      (k) => !["areas", "columns", "rows", "gap"].includes(k),
    ) ||
    !Array.isArray(layout.areas) ||
    layout.areas.length < 1 ||
    layout.areas.length > 6
  )
    throw Error("Layout requires a bounded area grid.");
  const allowed = ["aside", "nav", "content", "footer", "."],
    width = layout.areas[0]?.length;
  if (
    !width ||
    width > 4 ||
    layout.areas.some(
      (r) =>
        !Array.isArray(r) ||
        r.length !== width ||
        r.some((x) => !allowed.includes(x)),
    )
  )
    throw Error("Use aside, nav, content, footer and . areas.");
  const cells = layout.areas;
  for (const name of allowed.slice(0, 4)) {
    const found = [];
    cells.forEach((r, y) =>
      r.forEach((v, x) => {
        if (v === name) found.push([x, y]);
      }),
    );
    if (!found.length) throw Error("Keep all four app regions in your layout.");
    const xs = found.map((x) => x[0]),
      ys = found.map((x) => x[1]);
    if (
      found.length !==
      (Math.max(...xs) - Math.min(...xs) + 1) *
        (Math.max(...ys) - Math.min(...ys) + 1)
    )
      throw Error("Layout areas must be rectangles.");
  }
  const track = (x) =>
    typeof x === "string" &&
    /^(?:\d{1,4}px|(?:0|[1-9]\d?)(?:\.\d{1,2})?fr|auto|minmax\(0,\s*(?:\d{1,4}px|[1-9]\d?fr)\))$/.test(
      x,
    );
  if (
    !Array.isArray(layout.columns) ||
    layout.columns.length !== width ||
    !layout.columns.every(track) ||
    (layout.rows &&
      (!Array.isArray(layout.rows) ||
        layout.rows.length !== cells.length ||
        !layout.rows.every(track)))
  )
    throw Error("Use bounded px, fr, auto or minmax(0, 1fr) tracks.");
  const gap = layout.gap ?? 12;
  if (!Number.isInteger(gap) || gap < 0 || gap > 48)
    throw Error("Gap must be 0–48px.");
  return {
    gridTemplateAreas: cells.map((r) => '"' + r.join(" ") + '"').join(" "),
    gridTemplateColumns: layout.columns.join(" "),
    gridTemplateRows: layout.rows?.join(" ") || "auto",
    gap: gap + "px",
  };
}
