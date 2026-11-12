// Owner access is server configuration, never a profile field or client claim.
export function isPlatformOwner(user) {
  const email = (process.env.PLATFORM_OWNER_EMAIL || "").trim().toLowerCase();
  return (
    !!email &&
    !!user &&
    Number(user.email_verified) === 1 &&
    !user.deleted_at &&
    user.email?.toLowerCase() === email
  );
}
export function requirePlatformOwner(req, res, next) {
  res.set("Cache-Control", "no-store");
  if (!isPlatformOwner(req.user))
    return res
      .status(403)
      .json({ error: "This area is restricted to the platform owner." });
  next();
}
