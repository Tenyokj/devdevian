import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRuntime, allowedOrigin } from "../runtime-config.mjs";
test("production rejects demo accounts, verification bypass and ephemeral Vercel storage", () => {
  assert.doesNotThrow(() => assertRuntime({ NODE_ENV: "development" }));
  assert.doesNotThrow(() =>
    assertRuntime({
      NODE_ENV: "production",
      APP_URL: "https://devdevian.example",
    }),
  );
  for (const key of ["DEMO_MODE", "AUTH_TEST_UNVERIFIED"])
    assert.throws(
      () =>
        assertRuntime({
          NODE_ENV: "production",
          APP_URL: "https://devdevian.example",
          [key]: "1",
        }),
      /forbidden/,
    );
  assert.throws(() => assertRuntime({ VERCEL: "1" }), /durable cloud storage/);
  assert.throws(
    () =>
      assertRuntime({
        NODE_ENV: "production",
        APP_URL: "http://devdevian.example",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      assertRuntime({
        NODE_ENV: "production",
        APP_URL: "https://user:secret@devdevian.example/path",
      }),
    /origin/,
  );
});
test("production origin checks work behind TLS termination without trusting forwarded input", () => {
  const req = {
    protocol: "http",
    headers: { host: "internal:3000", "x-forwarded-host": "attacker.example" },
  };
  assert.equal(
    allowedOrigin(req, {
      NODE_ENV: "production",
      APP_URL: "https://devdevian.example",
    }),
    "https://devdevian.example",
  );
  assert.equal(
    allowedOrigin(req, { NODE_ENV: "development" }),
    "http://internal:3000",
  );
});
test("hosted runtime requires complete private storage configuration", () => {
  const env = {
    VERCEL: "1",
    APP_URL: "https://devdevian.example",
    TURSO_DATABASE_URL: "libsql://example.turso.io",
    TURSO_AUTH_TOKEN: "test-only-token",
    UPLOAD_DRIVER: "s3",
    S3_ENDPOINT: "https://objects.example",
    S3_BUCKET: "private",
    S3_ACCESS_KEY_ID: "test-only-id",
    S3_SECRET_ACCESS_KEY: "test-only-secret",
  };
  assert.doesNotThrow(() => assertRuntime(env));
  assert.throws(
    () => assertRuntime({ ...env, UPLOAD_DRIVER: "local" }),
    /private S3/,
  );
  assert.throws(
    () => assertRuntime({ ...env, S3_SECRET_ACCESS_KEY: "" }),
    /private S3/,
  );
  assert.throws(
    () => assertRuntime({ ...env, S3_ENDPOINT: "http://objects.example" }),
    /HTTPS/,
  );
});
