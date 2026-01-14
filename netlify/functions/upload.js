import Busboy from "busboy";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: event.headers });

    const fields = {};
    let fileBuffer = null;
    let fileMime = "application/octet-stream";

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (name, file, info) => {
      fileMime = info?.mimeType || fileMime;
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => reject(new Error("File too large")));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, fileBuffer, fileMime }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    bb.end(body);
  });
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { fields, fileBuffer, fileMime } = await parseMultipart(event);

    const sessionId = fields.sessionId;
    const idxRaw = fields.idx;

    if (!sessionId || idxRaw === undefined) {
      return { statusCode: 400, body: "Missing sessionId or idx" };
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      return { statusCode: 400, body: "Missing file" };
    }

    const R2_ENDPOINT = getRequiredEnv("R2_ENDPOINT");
    const R2_BUCKET = getRequiredEnv("R2_BUCKET");
    const R2_ACCESS_KEY_ID = getRequiredEnv("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = getRequiredEnv("R2_SECRET_ACCESS_KEY");

    const s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });

    // idx עם padding כדי שיהיה סדר לקבצים
    const idx = String(Number(idxRaw)).padStart(6, "0");
    const key = `sessions/${sessionId}/chunks/${idx}.webm`;

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: fileMime || "video/webm"
      })
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, key })
    };
  } catch (err) {
    console.error("upload error:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err?.message || err) })
    };
  }
};
