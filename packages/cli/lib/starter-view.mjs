import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.mjs";
import { clip, wrap } from "./tui-model.mjs";
import { starterChoices } from "./doctor.mjs";
const h = React.createElement;

export function StarterView({ index, width, height }) {
  const c = useTheme();
  const roomy = height >= 18;
  const header = height >= 8 ? 2 : 1;
  const capacity = Math.max(1, height - header);
  const first = Math.max(0, index - capacity + 1);
  const choices = roomy
    ? starterChoices
    : starterChoices.slice(first, first + capacity);
  const rows = [
    { text: "YOUR FIRST FEW MINUTES", color: c.purple },
    ...(header > 1
      ? [
          {
            text: "One account. Browser and terminal stay connected.",
            color: c.muted,
          },
        ]
      : []),
    ...(roomy ? [{ text: " " }] : []),
    ...choices.flatMap((item, offset) => {
      const i = roomy ? offset : first + offset;
      return [
        {
          text: `${i === index ? "›" : " "} ${i + 1}. ${item.title}`,
          color: i === index ? c.blue : c.text,
          selected: i === index,
        },
        ...(roomy
          ? wrap(item.detail, width - 3)
              .slice(0, 1)
              .map((text) => ({ text: "   " + text, color: c.muted }))
          : []),
        ...(roomy ? [{ text: " " }] : []),
      ];
    }),
  ];
  return h(
    Box,
    { width, height, flexDirection: "column", overflow: "hidden" },
    ...rows
      .slice(0, height)
      .map((row, i) =>
        h(
          Text,
          {
            key: i,
            flexShrink: 0,
            color: row.color || c.text,
            backgroundColor: row.selected ? c.selected : undefined,
            wrap: "truncate",
          },
          clip(row.text, width),
        ),
      ),
  );
}
