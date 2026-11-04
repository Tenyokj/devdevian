// Keep production HTML restrictive without trusting inline executable scripts.
// Inline styles remain necessary for React layout; remote images use HTTPS only.
export const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";
export function securityHeaders(req, res, next) {
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  next();
}
