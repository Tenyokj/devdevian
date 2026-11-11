import React, { useState } from "react";
import { Modal, Field, ErrorMessage } from "./ui";
import { api, readAPIResponse } from "./data";
import { validatePackage } from "../extension-package.mjs";
import { validateListing } from "../extension-listing.mjs";
const blank = {
  name: "",
  slug: "",
  version: "1.0.0",
  description: "",
  full_description: "",
  tags: "",
  links: [],
  screenshots: [],
};
export function PublishExtension({ close, onPublished }) {
  const [pkg, setPkg] = useState(null),
    [draft, setDraft] = useState(blank),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [consent, setConsent] = useState(false),
    [live, setLive] = useState(false);
  const edit = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const accept = (value) => {
    if (!value?.manifest || value.manifest.kind !== "extension")
      throw Error(
        "This is not a Devdevian extension package. Choose a .devext.json built with extension:pack, or load the working example below. Renaming a random JSON file will not convert it into an extension.",
      );
    validatePackage(value.manifest);
    const listing = validateListing(value.listing);
    setPkg(value);
    setDraft({
      ...blank,
      name: value.name || "",
      slug: value.slug || "",
      version: value.version || "1.0.0",
      description: value.description || "",
      ...listing,
      tags: listing.tags.join(", "),
    });
    setConsent(false);
    setError("");
  };
  const payload = () => {
    if (!pkg) throw Error("Choose a valid extension package first.");
    return {
      name: draft.name,
      slug: draft.slug,
      version: draft.version,
      description: draft.description,
      manifest: pkg.manifest,
      listing: validateListing({
        full_description: draft.full_description,
        tags: draft.tags.split(/[,\s]+/).filter(Boolean),
        links: draft.links,
        screenshots: draft.screenshots,
      }),
    };
  };
  const load = async (path) => {
    try {
      accept(await readAPIResponse(await fetch(path)));
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Publish an extension" onClose={close} wide>
      <div className="extension-publish-steps">
        <span>01 · Code package</span>
        <span>02 · Listing & screenshots</span>
        <span>03 · Preview & publish</span>
      </div>
      <p className="modal-description">
        Upload your code, then create the page people will see in the library.
        Uploading alone never runs code. Publishing creates an immutable
        version.
      </p>
      <ErrorMessage error={error} />
      <section className="extension-example-help">
        <strong>First time here? Try a working extension.</strong>
        <p>
          Studio Shell moves navigation below the workspace and styles the whole
          app. A random JSON, image or source file is not an installable
          package.
        </p>
        <div className="extension-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => load("/extension-examples/studio-shell.devext.json")}
          >
            Load Studio Shell example
          </button>
          <a href="/extension-examples/studio-shell.devext.json" download>
            Download example package ↗
          </a>
          <a href="/docs/extensions" target="_blank" rel="noreferrer">
            Developer guide ↗
          </a>
        </div>
      </section>
      <label className="extension-package-drop">
        {pkg
          ? `Package ready · ${Object.keys(pkg.manifest.files).length} source files`
          : "Choose a .devext.json code package"}
        <input
          aria-label="Extension package file"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            try {
              setPkg(null);
              setConsent(false);
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 210000)
                throw Error(
                  "Package exceeds 210 KB. Build a smaller .devext.json package.",
                );
              let value;
              try {
                value = JSON.parse(await file.text());
              } catch {
                throw Error(
                  "This file is not valid JSON. Choose a built .devext.json package or try the example above.",
                );
              }
              accept(value);
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      </label>
      <div className="extension-listing-form">
        <h2>Library listing</h2>
        <p>
          These fields and packaged sources will be public. Never include
          secrets or private work.
        </p>
        <div className="form-grid">
          <Field label="Extension name">
            <input
              aria-label="Extension name"
              value={draft.name}
              maxLength={60}
              placeholder="My developer workspace"
              onChange={(e) => edit("name", e.target.value)}
            />
          </Field>
          <Field label="Unique slug">
            <input
              aria-label="Unique slug"
              value={draft.slug}
              maxLength={48}
              placeholder="my-workspace"
              onChange={(e) => edit("slug", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Version">
          <input
            aria-label="Extension version"
            value={draft.version}
            placeholder="1.0.0"
            onChange={(e) => edit("version", e.target.value)}
          />
        </Field>
        <Field
          label="Short description"
          hint="20–1,200 characters; shown on the library card."
        >
          <textarea
            aria-label="Short description"
            rows={2}
            maxLength={1200}
            value={draft.description}
            onChange={(e) => edit("description", e.target.value)}
          />
        </Field>
        <Field
          label="Full description"
          hint="Markdown supported. Explain features, setup, shortcuts, limitations and external services. Up to 20,000 characters."
        >
          <textarea
            aria-label="Full description"
            rows={7}
            maxLength={20000}
            placeholder="## What it does"
            value={draft.full_description}
            onChange={(e) => edit("full_description", e.target.value)}
          />
        </Field>
        <Field
          label="Tags"
          hint="Up to 8 tags, separated by commas; 2–30 characters per tag."
        >
          <input
            aria-label="Extension tags"
            value={draft.tags}
            placeholder="productivity, theme, layout"
            onChange={(e) => edit("tags", e.target.value)}
          />
        </Field>
        <section>
          <h3>Links</h3>
          <p>
            Source code, documentation, website or support — up to 5 HTTPS
            links.
          </p>
          {draft.links.map((link, i) => (
            <div className="extension-link-row" key={i}>
              <input
                aria-label={`Link ${i + 1} label`}
                placeholder="Source code"
                value={link.label}
                maxLength={40}
                onChange={(e) =>
                  edit(
                    "links",
                    draft.links.map((v, j) =>
                      j === i ? { ...v, label: e.target.value } : v,
                    ),
                  )
                }
              />
              <input
                aria-label={`Link ${i + 1} URL`}
                type="url"
                placeholder="https://github.com/you/extension"
                value={link.url}
                onChange={(e) =>
                  edit(
                    "links",
                    draft.links.map((v, j) =>
                      j === i ? { ...v, url: e.target.value } : v,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove link ${i + 1}`}
                onClick={() =>
                  edit(
                    "links",
                    draft.links.filter((_, j) => j !== i),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={draft.links.length >= 5}
            onClick={() =>
              edit("links", [...draft.links, { label: "", url: "" }])
            }
          >
            + Add link
          </button>
        </section>
        <section>
          <h3>Screenshots</h3>
          <p>
            Up to 6 PNG, JPG, WebP or GIF images, 4 MB each. Images become
            public when you publish the listing.
          </p>
          <div className="extension-screenshots">
            {draft.screenshots.map((id, i) => (
              <figure key={id}>
                <img src={"/api/uploads/" + id} alt={`Screenshot ${i + 1}`} />
                <button
                  type="button"
                  aria-label={`Remove screenshot ${i + 1}`}
                  onClick={() =>
                    edit(
                      "screenshots",
                      draft.screenshots.filter((v) => v !== id),
                    )
                  }
                >
                  Remove
                </button>
              </figure>
            ))}
          </div>
          <label className="extension-image-upload">
            {uploading ? "Uploading…" : "Add screenshots"}
            <input
              aria-label="Extension screenshots"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading || draft.screenshots.length >= 6}
              onChange={async (e) => {
                const files = [...e.target.files];
                e.target.value = "";
                setUploading(true);
                setError("");
                let ids = [...draft.screenshots];
                try {
                  if (files.length + ids.length > 6)
                    throw Error("Choose at most 6 screenshots.");
                  for (const file of files) {
                    if (file.size > 4 * 1024 * 1024)
                      throw Error("Screenshots must be under 4 MB each.");
                    const r = await fetch("/api/uploads", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/octet-stream",
                        "X-Filename": encodeURIComponent(file.name),
                      },
                      body: file,
                      signal: AbortSignal.timeout(30000),
                    });
                    const uploaded = await readAPIResponse(r);
                    if (!uploaded.mime?.startsWith("image/"))
                      throw Error("Choose an image file for a screenshot.");
                    ids.push(uploaded.id);
                    edit("screenshots", [...ids]);
                  }
                } catch (e) {
                  setError(e.message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </section>
      </div>
      {["localhost", "127.0.0.1"].includes(location.hostname) && (
        <div className="extension-editor">
          <strong>Local development</strong>
          <p>Run npm run extension:dev -- path/to/extension.</p>
          <button
            className="text-button"
            onClick={() => load("/api/extensions/development")}
          >
            Load local build
          </button>
          {pkg && (
            <label>
              <input
                type="checkbox"
                checked={live}
                disabled={!consent}
                onChange={(e) => setLive(e.target.checked)}
              />{" "}
              Live preview (local server only)
            </label>
          )}
        </div>
      )}
      {pkg && (
        <>
          <div className="extension-capabilities">
            <strong>Requested capabilities</strong>
            <ul>
              {pkg.manifest.permissions.map((p) => (
                <li key={p}>
                  <code>{p}</code>
                </li>
              ))}
            </ul>
            <p>
              Data reads may include private work you can access; network grants
              let code send information to the listed services. Inspect code
              before granting access.
            </p>
          </div>
          <details className="extension-editor">
            <summary>
              Inspect packaged sources ({Object.keys(pkg.manifest.files).length}
              )
            </summary>
            {Object.entries(pkg.manifest.files).map(([path, source]) => (
              <details key={path}>
                <summary>{path}</summary>
                <pre>{source}</pre>
              </details>
            ))}
          </details>
          <label className="extension-ack">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I trust this code and allow its declared capabilities for a local
            preview. This does not grant other extensions access.
          </label>
        </>
      )}
      <div className="extension-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!pkg || !consent || uploading}
          onClick={() => {
            try {
              window.dispatchEvent(
                new window.CustomEvent("devdevian-extension-preview", {
                  detail: { ...payload(), build: pkg.build, live },
                }),
              );
              close();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Preview in my app
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!pkg || busy || uploading}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const value = payload();
              if (
                !value.name.trim() ||
                !value.slug ||
                value.description.trim().length < 20
              )
                throw Error(
                  "Add a name, unique slug and short description of at least 20 characters before publishing.",
                );
              const result = await api("/extensions/publish", {
                method: "POST",
                headers: { "X-Devdevian-Extensions": "2" },
                body: value,
              });
              onPublished(result);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Publishing…" : "Publish immutable package"}
        </button>
      </div>
    </Modal>
  );
}
