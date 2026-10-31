import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import stringWidth from "string-width";
import { clip, wrap } from "./tui-model.mjs";
import { useTheme } from "./theme.mjs";
const h = React.createElement;
// Terminal-native mascot: ghost, laptop and orbit, drawn without image protocols.
const full = [
  '           .-""""-.',
  "          /        \\",
  "         /  .----.  \\       +",
  "        |  ( o  o )  |",
  "    .---|   '----' .-------.",
  " .-'    |        /  </>  / '-.",
  "(       |   _   /______/      )",
  " '---.._ \\_/ \\_/     _..---'",
  "         '----------'",
];
const small = [
  "   .---.    .-----.",
  "  ( o o )  / </> /",
  "  /_   _\\ /_____/",
  "    '---'",
];
const pumpkin = [
  "          __",
  "         /_/",
  "     .-'''''-.",
  "   .'  | | |  '.",
  "  /  /\\     /\\  \\",
  " |  /__\\   /__\\  |",
  " |      ___      |",
  " |  \\  /_W_\\  /  |",
  "  \\  '-------'  /",
  "   '._  | | _.'",
  "       '---'",
];
const smallPumpkin = [
  "    _",
  " .-( )-.",
  "( ^   ^ )",
  "(  vvv  )",
  " '-----'",
];
export function deviArt(compact = false, frame = 0, variant = "devi") {
  if (variant === "pumpkin")
    return (compact ? smallPumpkin : pumpkin).map((line) =>
      frame % 6 === 4
        ? line.replace("/\\", "--").replace("^   ^", "-   -")
        : line,
    );
  const blink = frame % 6 === 4;
  return (compact ? small : full).map((line) =>
    blink ? line.replace("o  o", "-  -").replace("o o", "- -") : line,
  );
}
// Required status and controls get space before decoration. No minimum display timer.
export function deviLayout({
  width,
  height,
  message,
  status = [],
  footer = [],
  show = true,
  frame = 0,
  variant = "devi",
}) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const instructions = footer.flatMap((line) => wrap(line, width));
  const details = status.flatMap((line) => wrap(line, width));
  const footerRows = instructions.slice(0, height);
  const budget = Math.max(0, height - footerRows.length);
  const detailRows = details.slice(0, budget);
  let remaining = height - footerRows.length - detailRows.length;
  const title = message ? wrap(message, width) : [];
  let art = [];
  if (show) {
    for (const compact of [false, true]) {
      const candidate = deviArt(compact, frame, variant);
      if (
        candidate.every((line) => stringWidth(line) <= width) &&
        candidate.length + title.length + 2 <= remaining
      ) {
        art = candidate;
        break;
      }
    }
  }
  const rows = [];
  if (art.length) {
    rows.push(
      ...art.map((text) => ({
        text: text.padEnd(Math.max(...art.map((line) => stringWidth(line)))),
        role: text.includes("</>") ? "blue" : "purple",
      })),
      { text: "" },
    );
    remaining -= art.length + 1;
  }
  if (title.length && title.length <= remaining) {
    rows.push(...title.map((text) => ({ text, role: "text", bold: true })));
    remaining -= title.length;
  }
  if (remaining && rows.length) rows.push({ text: "" });
  rows.push(
    ...detailRows.map((text) => ({ text, role: "text" })),
    ...footerRows.map((text) => ({ text, role: "muted" })),
  );
  return rows
    .slice(0, height)
    .map((row) => ({ ...row, text: clip(row.text, width) }));
}
export function DeviPanel({
  width,
  height,
  message = "Devi missed you.",
  status,
  footer,
  show = true,
  animate = false,
  motion = "subtle",
}) {
  const c = useTheme(),
    [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!show || !animate || motion === "reduced") return;
    const timer = setInterval(() => setFrame((value) => (value + 1) % 6), 400);
    return () => clearInterval(timer);
  }, [show, animate, motion]);
  const rows = deviLayout({
    width,
    height,
    message:
      c.seasonal && message.startsWith("Devi ")
        ? "A little code. A little pumpkin magic."
        : message,
    variant: c.seasonal ? "pumpkin" : "devi",
    status,
    footer,
    show,
    frame: motion === "reduced" ? 0 : frame,
  });
  return h(
    Box,
    {
      width,
      height,
      flexDirection: "column",
      justifyContent: "center",
      overflow: "hidden",
    },
    ...rows.map((row, index) =>
      h(
        Text,
        {
          key: index,
          color: c[row.role] || c.text,
          bold: row.bold,
          wrap: "truncate",
        },
        " ".repeat(
          Math.max(0, Math.floor((width - stringWidth(row.text)) / 2)),
        ) + row.text,
      ),
    ),
  );
}
