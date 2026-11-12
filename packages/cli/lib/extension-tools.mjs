import { mkdir, writeFile, readFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { buildExtension } from "./extension-build.mjs";
import { networkOrigins } from "./sdk/package.mjs";

export async function initExtension(path) {
  const directory = resolve(path),
    slug = directory.split(/[\\/]/).at(-1);
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(slug))
    throw Error(
      "Use a directory name such as my-extension (3–48 lowercase letters, numbers and hyphens).",
    );
  // mkdir without recursive refuses existing directories; never overwrite a project.
  await mkdir(directory);
  const config = {
    name: slug
      .split("-")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" "),
    slug,
    version: "1.0.0",
    description: "A personal Devdevian panel, built with the extension SDK.",
    entry: "main.js",
    permissions: ["ui.panel", "storage", "ui.commands"],
    listing: {
      full_description:
        "## My extension\n\nDescribe what your tool does and which capabilities it uses.",
      tags: ["productivity"],
      links: [],
      screenshots: [],
      changelog: "First version.",
    },
  };
  await writeFile(
    join(directory, "devdevian.extension.json"),
    JSON.stringify(config, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(
    join(directory, "main.js"),
    `(async () => {
  await devdevian.panel.configure({placement: "right", title: "My extension", width: 340, height: 300});
  const root = document.getElementById("root");
  root.innerHTML = '<main style="padding:24px;font:16px system-ui"><h1>Hello, builder.</h1><button id="save">Remember this moment</button><p id="status"></p></main>';
  document.getElementById("save").onclick = async () => {
    await devdevian.storage.set("last-visit", new Date().toISOString());
    document.getElementById("status").textContent = "Saved on this device.";
  };
  await devdevian.commands.register({id: "hello", title: "Say hello", shortcut: "Alt+Shift+H"}, () => {
    document.getElementById("status").textContent = "Hello from your extension command!";
  });
})();\n`,
    { flag: "wx" },
  );
  await writeFile(
    join(directory, "README.md"),
    `# ${config.name}\n\nRun \`devdevian extensions dev .\` for a local SDK playground with sample data. Review permissions and press Start preview. Edit main.js to reload; changed permissions require new consent.\n\nRun \`devdevian extensions pack .\`, then inspect the package before \`devdevian extensions publish --file dist/${slug}-1.0.0.devext.json\`. All included source will be public.\n\nThe playground has no real accounts or production data; validate final layout in the hosted forum's Preview. Documentation: https://devdevian.vercel.app/docs/extensions\n`,
    { flag: "wx" },
  );
  return {
    directory,
    files: ["devdevian.extension.json", "main.js", "README.md"],
  };
}

export async function packExtension(directory) {
  const { build, ...pkg } = await buildExtension(directory);
  const dist = join(resolve(directory), "dist");
  await mkdir(dist, { recursive: true });
  if ((await lstat(dist)).isSymbolicLink())
    throw Error("The output directory must not be a symlink.");
  const output = join(dist, `${pkg.slug}-${pkg.version}.devext.json`);
  // Atomic generated output, with no following an existing destination symlink.
  const temp = join(dist, `.pack-${randomBytes(8).toString("hex")}`);
  const { rename, unlink } = await import("node:fs/promises");
  try {
    await writeFile(temp, JSON.stringify(pkg, null, 2) + "\n", { flag: "wx" });
    await rename(temp, output);
  } finally {
    await unlink(temp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  return {
    output,
    name: pkg.name,
    version: pkg.version,
    permissions: pkg.manifest.permissions,
    build,
  };
}

export async function serveExtension(directory, { port = 4188 } = {}) {
  directory = resolve(directory);
  let current = await buildExtension(directory),
    inflight;
  const assets = new URL("../playground/", import.meta.url);
  const [html, js, css, runner] = await Promise.all(
    ["index.html", "app.js", "app.css", "runner.js"].map((p) =>
      readFile(new URL(p, assets)),
    ),
  );
  let origin;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Bound loopback listener + exact Host check prevents DNS rebinding.
    if (req.headers.host !== new URL(origin).host) {
      res.writeHead(403);
      return res.end("Invalid local host.");
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end();
    }
    const url = new URL(req.url, origin);
    if (url.pathname === "/build") {
      if (req.headers.origin && req.headers.origin !== origin) {
        res.writeHead(403);
        return res.end();
      }
      try {
        inflight ??= buildExtension(directory).finally(() => {
          inflight = null;
        });
        current = await inflight;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(current));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.pathname === "/api/extensions/runner") {
      const origins = networkOrigins(current.manifest.permissions);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'self' blob:; style-src 'unsafe-inline'; img-src data: blob: ${origins.join(" ")}; connect-src ${origins.length ? origins.join(" ") : "'none'"}; font-src data:; media-src data: blob:; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts`,
      );
      res.end(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/api/extensions/runner-script"></script>',
      );
      return;
    }
    if (url.pathname === "/api/extensions/runner-script") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(runner);
    }
    if (/^\/api\/(posts|projects|events)(?:\/[1-9]\d*)?$/.test(url.pathname)) {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify(
          url.pathname.match(/\d$/)
            ? {
                id: 1,
                title: "SDK sample conversation",
                body: "Local fixture data. No production account is connected.",
              }
            : {
                items: [
                  {
                    id: 1,
                    title: "SDK sample conversation",
                    name: "SDK sample project",
                    body: "Local fixture data.",
                  },
                ],
                pagination: { page: 1, pages: 1, total: 1 },
              },
        ),
      );
    }
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } else if (url.pathname === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(js);
    } else if (url.pathname === "/app.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(port, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      yes();
    });
  });
  return {
    origin,
    close: () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  };
}
