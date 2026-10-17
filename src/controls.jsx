import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Check,
  Search,
  Plus,
  X,
  ImagePlus,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { api } from "./data";
export function Select({
  children,
  options: given,
  value,
  defaultValue,
  name,
  onChange,
  searchable = false,
  "aria-label": label = "Choose an option",
  disabled = false,
}) {
  const options =
    given ||
    React.Children.toArray(children)
      .filter(React.isValidElement)
      .map((c) => ({
        value: String(c.props.value ?? c.props.children),
        label: c.props.children,
      }));
  const [local, setLocal] = useState(defaultValue ?? options[0]?.value ?? ""),
    [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [active, setActive] = useState(0),
    [optionPage, setOptionPage] = useState(1);
  const root = useRef(null),
    trigger = useRef(null);
  const selected = value ?? local;
  const filtered = options.filter(
    (o) => !q || String(o.label).toLowerCase().includes(q.toLowerCase()),
  );
  useEffect(() => {
    const close = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const choose = (v) => {
    setLocal(v);
    onChange?.({ target: { value: v } });
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="custom-select"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          setOpen(true);
          setActive((a) => {
            const next = Math.max(
              0,
              Math.min(
                filtered.length - 1,
                a + (e.key === "ArrowDown" ? 1 : -1),
              ),
            );
            setOptionPage(Math.floor(next / 8) + 1);
            return next;
          });
        }
        if (open && e.key === "Enter" && e.target === trigger.current) {
          e.preventDefault();
          if (filtered[active]) choose(filtered[active].value);
        }
      }}
    >
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {options.find((o) => String(o.value) === String(selected))?.label ||
          "Choose…"}
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="select-popover">
          {searchable && (
            <input
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOptionPage(1);
                setActive(0);
              }}
            />
          )}
          <div role="listbox" aria-label={label}>
            {filtered
              .slice((optionPage - 1) * 8, optionPage * 8)
              .map((o, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={String(selected) === String(o.value)}
                  className={
                    i + (optionPage - 1) * 8 === active ? "focused" : ""
                  }
                  key={o.value}
                  onClick={() => choose(o.value)}
                >
                  {o.label}
                  {String(selected) === String(o.value) && <Check size={14} />}
                </button>
              ))}
            {!filtered.length && <p>No matches</p>}
          </div>
          {filtered.length > 8 && (
            <div className="picker-paging">
              <button
                type="button"
                aria-label="Previous options"
                disabled={optionPage === 1}
                onClick={() => setOptionPage(optionPage - 1)}
              >
                <ArrowLeft size={14} />
              </button>
              <span>
                {optionPage} / {Math.ceil(filtered.length / 8)}
              </span>
              <button
                type="button"
                aria-label="Next options"
                disabled={optionPage >= Math.ceil(filtered.length / 8)}
                onClick={() => setOptionPage(optionPage + 1)}
              >
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export function TaxonomyPicker({
  kind = "topic",
  name = "topic",
  defaultValue,
  initial = [],
  multiple = false,
}) {
  const [selected, setSelected] = useState(
      multiple
        ? String(defaultValue || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : defaultValue || initial[0]?.id || "web",
    ),
    [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [items, setItems] = useState(initial),
    [meta, setMeta] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [known, setKnown] = useState(initial);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(
      () =>
        api(`/taxonomy/${kind}?q=${encodeURIComponent(q)}&page=${page}`)
          .then((r) => {
            if (alive) {
              setItems(r);
              setMeta(r.pagination);
              setKnown((k) => [
                ...k,
                ...r.filter((x) => !k.some((v) => v.id === x.id)),
              ]);
            }
          })
          .catch((e) => alive && setError(e.message)),
      180,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, q, page, kind]);
  useEffect(() => {
    const close = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const choose = (item) => {
    setKnown((k) => [...k, item]);
    if (multiple)
      setSelected((s) =>
        s.includes(item.name)
          ? s.filter((x) => x !== item.name)
          : [...s, item.name],
      );
    else {
      setSelected(item.id);
      setOpen(false);
    }
  };
  return (
    <div
      className="taxonomy-picker custom-select"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <input
        type="hidden"
        name={name}
        value={multiple ? selected.join(", ") : selected}
      />
      <button
        type="button"
        className="select-trigger"
        aria-label={
          kind === "topic" ? "Choose topic" : "Choose tools and technologies"
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          {multiple
            ? selected.length
              ? selected.join(", ")
              : "Add technologies…"
            : known.find((t) => t.id === selected)?.name ||
              initial.find((t) => t.id === selected)?.name ||
              "Choose a topic…"}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="select-popover taxonomy-popover">
          <div className="picker-search">
            <Search size={16} />
            <input
              autoFocus
              aria-label={`Search ${kind}s`}
              placeholder={`Find or create a ${kind}…`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
                setError("");
              }}
            />
          </div>
          <div
            role="listbox"
            aria-label={kind}
            aria-multiselectable={multiple || undefined}
          >
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={
                  multiple ? selected.includes(t.name) : selected === t.id
                }
                onClick={() => choose(t)}
              >
                <span>
                  {t.name}
                  <small>{t.post_count || 0} posts</small>
                </span>
                {(multiple ? selected.includes(t.name) : selected === t.id) && (
                  <Check size={15} />
                )}
              </button>
            ))}
          </div>
          {meta && meta.pages > 1 && (
            <div className="picker-paging">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ArrowLeft size={14} />
              </button>
              <span>
                {meta.page} / {meta.pages}
              </span>
              <button
                type="button"
                disabled={page >= meta.pages}
                onClick={() => setPage(page + 1)}
              >
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {q.trim().length >= 2 &&
            !items.some(
              (t) =>
                t.name.normalize("NFKC").toLowerCase() ===
                q.trim().normalize("NFKC").toLowerCase(),
            ) && (
              <button
                type="button"
                className="picker-create"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const t = await api("/taxonomy/" + kind, {
                      method: "POST",
                      body: { name: q },
                    });
                    choose(t);
                    setQ("");
                    setPage(1);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Plus size={15} /> Create “{q.trim()}”
              </button>
            )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {multiple && (
            <button
              type="button"
              className="button secondary full"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function LinksEditor({ initial = [] }) {
  const [links, setLinks] = useState(initial);
  return (
    <div className="links-editor">
      <input type="hidden" name="detail_links" value={JSON.stringify(links)} />
      <div className="editor-label">
        <span>Links · your labels, your destinations</span>
        <button
          type="button"
          onClick={() => setLinks([...links, { label: "", url: "" }])}
        >
          <Plus size={14} /> Add link
        </button>
      </div>
      {links.map((l, i) => (
        <div className="link-row" key={i}>
          <input
            required
            aria-label={`Link ${i + 1} label`}
            placeholder="Label, e.g. Documentation"
            maxLength={80}
            value={l.label}
            onChange={(e) =>
              setLinks(
                links.map((v, j) =>
                  j === i ? { ...v, label: e.target.value } : v,
                ),
              )
            }
          />
          <input
            required
            type="url"
            aria-label={`Link ${i + 1} URL`}
            placeholder="https://…"
            maxLength={1000}
            value={l.url}
            onChange={(e) =>
              setLinks(
                links.map((v, j) =>
                  j === i ? { ...v, url: e.target.value } : v,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Remove link"
            onClick={() => setLinks(links.filter((_, j) => j !== i))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
export function MediaPicker({ name, label, multiple = false, initial }) {
  const [ids, setIds] = useState(
      multiple ? initial || [] : initial ? [initial] : [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="media-picker" data-uploading={busy ? "true" : "false"}>
      <input
        type="hidden"
        name={"detail_" + name}
        value={JSON.stringify(multiple ? ids : ids[0] || null)}
      />
      <span className="field-caption">{label}</span>
      <div className="media-previews">
        {ids.map((id) => (
          <div key={id}>
            <img src={"/api/uploads/" + id} alt={label} />
            <button
              type="button"
              className="icon-button"
              aria-label={"Remove " + label}
              onClick={() => setIds(ids.filter((v) => v !== id))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <label className="upload-tile">
        <ImagePlus size={20} />
        <span>
          {busy ? "Uploading…" : multiple ? "Add images" : "Choose image"}
        </span>
        <small>PNG, JPG, WebP or GIF · 4 MB</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple={multiple}
          disabled={busy}
          onChange={async (e) => {
            const picked = [...e.target.files];
            e.target.value = "";
            setBusy(true);
            setError("");
            try {
              const uploaded = [];
              for (const f of picked.slice(0, multiple ? 10 - ids.length : 1)) {
                if (f.size > 4 * 1024 * 1024)
                  throw Error("Images must be under 4 MB.");
                const r = await fetch("/api/uploads", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/octet-stream",
                    "X-Filename": encodeURIComponent(f.name),
                  },
                  body: f,
                });
                const v = await r.json();
                if (!r.ok) throw Error(v.error);
                uploaded.push(v.id);
              }
              setIds(multiple ? [...ids, ...uploaded] : uploaded);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function formObject(form) {
  if (form.querySelector('[data-uploading="true"]'))
    throw Error("Wait for image uploads to finish.");
  const data = Object.fromEntries(new FormData(form));
  const details = {};
  for (const key of Object.keys(data))
    if (key.startsWith("detail_")) {
      try {
        details[key.slice(7)] = JSON.parse(data[key]);
      } catch {
        details[key.slice(7)] = data[key];
      }
      delete data[key];
    }
  if (Object.keys(details).length) data.details = details;
  return data;
}
export function EntityLinks({ links = [] }) {
  return (
    !!links.length && (
      <div className="entity-links">
        {links.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
    )
  );
}
export function Carousel({ images = [] }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  return (
    <div className="media-carousel">
      <a
        href={"/api/uploads/" + images[index % images.length]}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open screenshot ${index + 1} in full size`}
      >
        <img
          src={"/api/uploads/" + images[index % images.length]}
          alt={`Project screenshot ${index + 1}`}
          loading="lazy"
        />
      </a>
      {images.length > 1 && (
        <div>
          <button
            aria-label="Previous screenshot"
            onClick={() =>
              setIndex((index - 1 + images.length) % images.length)
            }
          >
            <ArrowLeft size={15} />
          </button>
          <span>
            {index + 1} / {images.length}
          </span>
          <button
            aria-label="Next screenshot"
            onClick={() => setIndex((index + 1) % images.length)}
          >
            <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
export function PeoplePicker({
  onChoose,
  label = "Find a developer",
  path = "/people",
}) {
  const [q, setQ] = useState(""),
    [people, setPeople] = useState([]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (q.trim())
        api(path + "?q=" + encodeURIComponent(q))
          .then((r) => alive && setPeople(r))
          .catch(() => {});
      else setPeople([]);
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, path]);
  return (
    <div className="people-picker">
      <input
        placeholder={label}
        aria-label={label}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!!people.length && (
        <div className="select-popover">
          {people.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onChoose(p);
                setQ("");
                setPeople([]);
              }}
            >
              <span className="mention-avatar">
                {p.avatar ? (
                  <img src={"/api/uploads/" + p.avatar} alt="" />
                ) : (
                  p.name[0]
                )}
              </span>
              <span>
                {p.name}
                <small>@{p.username}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function TeamEditor({ initial = [] }) {
  const [team, setTeam] = useState(initial);
  return (
    <div className="team-editor">
      <input
        type="hidden"
        name="detail_team"
        value={JSON.stringify(
          team.map((m) => ({ user_id: m.user_id, role: m.role })),
        )}
      />
      <span className="field-caption">Project team</span>
      <PeoplePicker
        onChoose={(p) => {
          if (!team.some((m) => m.user_id === p.id))
            setTeam([...team, { user_id: p.id, name: p.name, role: "" }]);
        }}
      />
      {team.map((m, i) => (
        <div className="link-row" key={m.user_id}>
          <span>{m.name}</span>
          <input
            required
            maxLength={80}
            placeholder="Role, e.g. Co-founder"
            value={m.role}
            onChange={(e) =>
              setTeam(
                team.map((v, j) =>
                  i === j ? { ...v, role: e.target.value } : v,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Remove team member"
            onClick={() => setTeam(team.filter((_, j) => j !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
export function MentionTextarea(props) {
  const [text, setText] = useState(props.defaultValue || ""),
    [query, setQuery] = useState(null),
    [people, setPeople] = useState([]);
  const ref = useRef(null);
  const value = props.value ?? text;
  useEffect(() => {
    let alive = true;
    if (!query) {
      setPeople([]);
      return;
    }
    const t = setTimeout(
      () =>
        api("/people?q=" + encodeURIComponent(query.name))
          .then((r) => alive && setPeople(r))
          .catch(() => {}),
      180,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query?.name]);
  return (
    <div className="mention-editor">
      <textarea
        {...props}
        defaultValue={undefined}
        ref={ref}
        value={value}
        onChange={(e) => {
          setText(e.target.value);
          props.onChange?.(e);
          const end = e.target.selectionStart,
            m = e.target.value
              .slice(0, end)
              .match(/(?:^|\s)@([a-zA-Z0-9_]{1,30})$/);
          setQuery(m ? { name: m[1], end } : null);
        }}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === "Escape" && query) {
            e.stopPropagation();
            setQuery(null);
          }
        }}
      />
      {!!people.length && query && (
        <div className="mention-results">
          {people.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                const start = query.end - query.name.length - 1,
                  next =
                    value.slice(0, start) +
                    "@" +
                    p.username +
                    " " +
                    value.slice(query.end);
                setText(next);
                props.onChange?.({ target: { value: next } });
                setQuery(null);
                ref.current?.focus();
              }}
            >
              <span className="mention-avatar">
                {p.avatar ? (
                  <img src={"/api/uploads/" + p.avatar} alt="" />
                ) : (
                  p.name[0]
                )}
              </span>
              <span>
                {p.name}
                <small>@{p.username}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
