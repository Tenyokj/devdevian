export const normalizeName = (value) =>
  String(value)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en");
// SQLite GLOB is Unicode-aware but not case-insensitive. Encode case variants
// as literal character classes; bind the resulting patterns, never SQL text.
export function literalPattern(text) {
  return Array.from(normalizeName(text))
    .map((char) => {
      const variants = new Set([char]);
      const upper = char.toLocaleUpperCase("en");
      if (Array.from(upper).length === 1) variants.add(upper);
      for (const c of [...variants]) {
        const n = c.codePointAt(0);
        if (n >= 33 && n <= 126) variants.add(String.fromCodePoint(n + 0xfee0));
      }
      const values = [...variants];
      if (values.length > 1 && !values.some((c) => "[]-^".includes(c)))
        return "[" + values.join("") + "]";
      return char === "["
        ? "[[]"
        : char === "*"
          ? "[*]"
          : char === "?"
            ? "[?]"
            : char;
    })
    .join("");
}
function parameterCount(sql) {
  let count = 0,
    quoted = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "'") {
      if (quoted && sql[i + 1] === "'") {
        i++;
        continue;
      }
      quoted = !quoted;
    } else if (!quoted && sql[i] === "?") count++;
  }
  return count;
}
export function portableQuery(original, values) {
  let sql = original;
  const args = [...values];
  const match = /dev_search\(([^,]+),\?\)/.exec(sql);
  if (match) {
    const index = parameterCount(sql.slice(0, match.index));
    args[index] = JSON.stringify(
      normalizeName(args[index])
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 10)
        .map((word) => "*" + literalPattern(word) + "*"),
    );
    sql =
      sql.slice(0, match.index) +
      `NOT EXISTS(SELECT 1 FROM json_each(?) search_word WHERE NOT ((${match[1]}) GLOB search_word.value))` +
      sql.slice(match.index + match[0].length);
  }
  sql = sql.replace(
    /dev_has_technology\(([^,]+),t\.normalized\)/g,
    (_, stack) =>
      `EXISTS(SELECT 1 FROM json_each('['||replace(json_quote(${stack}),',','","')||']') tool WHERE trim(tool.value) GLOB t.match_pattern)`,
  );
  return { sql, args };
}
