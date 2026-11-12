import { createHash } from "node:crypto";
// Signals for human review, not a proof that arbitrary JavaScript is safe.
export function inspectExtensionSecurity(manifest) {
  const permissions = manifest.permissions || [];
  const network = permissions.filter((p) => p.startsWith("network:"));
  const warnings = [];
  if (permissions.includes("data.read") && network.length)
    warnings.push({
      code: "private-data-network",
      severity: "high",
      message:
        "Can read accessible private work and send it to external services.",
    });
  else if (permissions.includes("data.read"))
    warnings.push({
      code: "private-data",
      severity: "medium",
      message:
        "Can read work available to the installing account, including private content.",
    });
  if (network.length)
    warnings.push({
      code: "network",
      severity: "medium",
      message:
        "External requests may transmit information entered in the extension.",
    });
  if (permissions.includes("ui.style") || permissions.includes("ui.layout"))
    warnings.push({
      code: "host-ui",
      severity: "medium",
      message:
        "Can hide, rearrange or imitate interface elements within the app surface.",
    });
  const sources = {
    ...manifest.files,
    ...Object.fromEntries(
      Object.entries(manifest.styles || {}).map(([k, v]) => ["style:" + k, v]),
    ),
  };
  const signals = [];
  const patterns = [
    [
      "dynamic-code",
      /\beval\s*\(|\bnew\s+Function\s*\(/,
      "Dynamic code execution needs manual inspection.",
    ],
    [
      "html-injection",
      /\binnerHTML\s*=|\binsertAdjacentHTML\s*\(/,
      "Inspect how HTML input is escaped.",
    ],
    [
      "busy-loop",
      /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/,
      "Potential unbounded loop; isolation does not enforce a CPU quota.",
    ],
  ];
  for (const [file, source] of Object.entries(sources))
    for (const [code, re, message] of patterns)
      if (re.test(source)) signals.push({ file, code, message });
  return {
    digest: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    warnings,
    signals,
    disclaimer:
      "Static signals are incomplete. Review every source file; Reviewed is a decision about this exact version, not a safety guarantee.",
  };
}
