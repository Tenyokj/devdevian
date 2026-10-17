import { test } from "node:test";
import assert from "node:assert/strict";
import { mailReady, sendVerificationCode } from "../mail.mjs";
test("Brevo verification messages use its API key and verified sender, without Resend credentials", async () => {
  const env = {
    MAIL_PROVIDER: "brevo",
    MAIL_FROM: "Devdevian <owner@example.test>",
    BREVO_API_KEY: "test-only-brevo",
  };
  assert.equal(mailReady(env), true);
  let request;
  await sendVerificationCode("new-user@example.test", "123456", {
    env,
    fetcher: async (url, options) => {
      request = { url, ...options };
      return { ok: true };
    },
  });
  assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(request.headers["api-key"], env.BREVO_API_KEY);
  assert.equal(request.headers.Authorization, undefined);
  const body = JSON.parse(request.body);
  assert.deepEqual(body.sender, {
    name: "Devdevian",
    email: "owner@example.test",
  });
  assert.deepEqual(body.to, [{ email: "new-user@example.test" }]);
  assert.match(body.textContent, /123456.*10 minutes/);
  assert.ok(request.signal instanceof AbortSignal);
});
test("unconfigured providers cannot send and provider errors do not leak recipient details", async () => {
  for (const env of [
    {},
    {
      MAIL_PROVIDER: "unknown",
      MAIL_FROM: "a@example.test",
      RESEND_API_KEY: "test",
    },
    { MAIL_PROVIDER: "brevo", MAIL_FROM: "bad", BREVO_API_KEY: "test" },
    {
      MAIL_PROVIDER: "brevo",
      MAIL_FROM: "a@example.test",
      RESEND_API_KEY: "test",
    },
  ]) {
    assert.equal(mailReady(env), false);
    await assert.rejects(
      sendVerificationCode("b@example.test", "123456", {
        env,
        fetcher: () => {
          throw Error("must not contact provider");
        },
      }),
      /not configured/,
    );
  }
  await assert.rejects(
    sendVerificationCode("b@example.test", "123456", {
      env: {
        MAIL_PROVIDER: "brevo",
        MAIL_FROM: "a@example.test",
        BREVO_API_KEY: "test",
      },
      fetcher: async () => ({
        ok: false,
        text: () => {
          throw Error("private details");
        },
      }),
    }),
    /^Error: Email delivery failed\. Please try again later\.$/,
  );
});
test("existing Resend installations retain their payload and authorization", async () => {
  const env = {
    MAIL_FROM: "a@example.test",
    RESEND_API_KEY: "test-only-resend",
  };
  assert.equal(mailReady(env), true);
  await sendVerificationCode("b@example.test", "654321", {
    env,
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options.headers.Authorization, "Bearer test-only-resend");
      const body = JSON.parse(options.body);
      assert.equal(body.from, env.MAIL_FROM);
      assert.deepEqual(body.to, ["b@example.test"]);
      assert.match(body.text, /654321/);
      return { ok: true };
    },
  });
});
