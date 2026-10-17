import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
export function objectStorage(env = process.env) {
  if (env.UPLOAD_DRIVER !== "s3") {
    const folder = join(dirname(env.DB_PATH || "data/arc.sqlite"), "uploads");
    mkdirSync(folder, { recursive: true });
    return {
      async put(id, bytes) {
        writeFileSync(join(folder, id), bytes, { flag: "wx" });
      },
      async get(id) {
        return readFileSync(join(folder, id));
      },
      async remove(id) {
        try {
          unlinkSync(join(folder, id));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      },
    };
  }
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || "auto",
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  const key = (id) => "uploads/" + id;
  const send = (command) =>
    client.send(command, { abortSignal: AbortSignal.timeout(20000) });
  return {
    async put(id, bytes, mime) {
      await send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key(id),
          Body: bytes,
          ContentType: mime,
          CacheControl: "private, no-store",
        }),
      );
    },
    async get(id) {
      const result = await send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key(id) }),
      );
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async remove(id) {
      await send(
        new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key(id) }),
      );
    },
  };
}
