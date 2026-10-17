// A local HTTP S3 contract fixture: no cloud credentials or buckets are used.
import { createServer } from "node:http";
import assert from "node:assert/strict";
export async function startS3Fixture() {
  const objects = new Map();
  let requests = 0;
  const server = createServer(async (req, res) => {
    try {
      assert.match(req.headers.authorization || "", /^AWS4-HMAC-SHA256 /);
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "PUT") {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        objects.set(path, Buffer.concat(buffers));
        res.setHeader("ETag", '"fixture"');
        res.end();
      } else if (req.method === "GET") {
        if (!objects.has(path)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(objects.get(path));
      } else if (req.method === "DELETE") {
        objects.delete(path);
        res.statusCode = 204;
        res.end();
      } else {
        res.statusCode = 405;
        res.end();
      }
      requests++;
    } catch (error) {
      res.statusCode = 500;
      res.end(error.message);
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    env: {
      UPLOAD_DRIVER: "s3",
      S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
      S3_BUCKET: "private-test",
      S3_ACCESS_KEY_ID: "test-only-key",
      S3_SECRET_ACCESS_KEY: "test-only-secret",
    },
    async close() {
      assert.ok(requests > 0, "The API must exercise S3 storage");
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
