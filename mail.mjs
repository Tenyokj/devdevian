// Mail credentials stay on the server. Provider acceptance does not guarantee
// inbox delivery: verify a real recipient before enabling public registration.
function provider(env) {
  return env.MAIL_PROVIDER || "resend";
}
function sender(env) {
  const raw = (env.MAIL_FROM || "").trim();
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(raw);
  const email = (match ? match[2] : raw).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) return null;
  return { name: match?.[1]?.trim() || "Devdevian", email };
}
export function mailReady(env = process.env) {
  if (!sender(env)) return false;
  if (provider(env) === "brevo") return !!env.BREVO_API_KEY;
  if (provider(env) === "resend") return !!env.RESEND_API_KEY;
  return false;
}
export async function sendVerificationCode(
  email,
  code,
  { env = process.env, fetcher = fetch } = {},
) {
  if (!mailReady(env)) throw Error("Email delivery is not configured.");
  const subject = "Your Devdevian verification code";
  const text = `Your verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  const brevo = provider(env) === "brevo";
  const response = await fetcher(
    brevo
      ? "https://api.brevo.com/v3/smtp/email"
      : "https://api.resend.com/emails",
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(brevo
          ? { "api-key": env.BREVO_API_KEY }
          : { Authorization: "Bearer " + env.RESEND_API_KEY }),
      },
      body: JSON.stringify(
        brevo
          ? { sender: sender(env), to: [{ email }], subject, textContent: text }
          : { from: env.MAIL_FROM, to: [email], subject, text },
      ),
    },
  );
  // Do not expose provider responses: they can contain recipient information.
  if (!response.ok)
    throw Error("Email delivery failed. Please try again later.");
}
