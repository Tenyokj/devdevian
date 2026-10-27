// Static wordmark; no terminal probes, image protocols or account reads.
const font = {
  D: ["████ ", "█   █", "█   █", "█   █", "████ "],
  E: ["█████", "█    ", "████ ", "█    ", "█████"],
  V: ["█   █", "█   █", "█   █", " █ █ ", "  █  "],
  I: ["█████", "  █  ", "  █  ", "  █  ", "█████"],
  A: [" ███ ", "█   █", "█████", "█   █", "█   █"],
  N: ["█   █", "██  █", "█ █ █", "█  ██", "█   █"],
};
export function renderHelp(
  text,
  { tty = false, columns = 80, noColor = false, json = false } = {},
) {
  if (!tty || json) return text;
  const paint = (value, color) =>
    noColor ? value : `\x1b[38;5;${color}m${value}\x1b[0m`;
  const banner =
    columns >= 56
      ? Array.from({ length: 5 }, (_, row) =>
          paint(
            [..."DEVDEVIAN"].map((c) => font[c][row]).join(" "),
            [111, 105, 141, 177, 183][row],
          ),
        ).join("\n")
      : paint("DEVDEVIAN", 141);
  const content = text
    .split("\n")
    .map((line) => {
      if (line.startsWith("Devdevian CLI")) return paint(line, 183);
      return line.replace(
        /^(  devdevian)(\s+[a-z]+(?:\s+(?:open|create|list|comment|thread|reply|resolve|reopen))?)?|(--[a-z][a-z-]*)/g,
        (match, command, rest) =>
          command
            ? paint(command, 111) + (rest ? paint(rest, 183) : "")
            : paint(match, 147),
      );
    })
    .join("\n");
  return `\n${banner}\n\n${content}`;
}
