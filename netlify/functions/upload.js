import Busboy from "busboy";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400"
};

// יוצר S3 client פעם אחת (לא בכל בקשה)
function makeS3() {
  const endpoint = required("R2_ENDPOINT"); // https://<accountid>.r2.cloudflarestorage.com
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey }
  });
}

const s3 = makeS3();

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const headers = event.headers || {};

    // Netlify/Lambda לפעמים נותן כותרות ב-lowercase; Busboy צריך content-type
    const contentType = headers["content-type"] || headers["Content-Type"];
    if (!contentType) {
      return reject(new Error("Missing Content-Type header (multipart boundary)"));
    }

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: {
        // תכוון לפי הצורך. לדוגמה: 25MB לכל chunk
        fileSize: 25 * 1024 * 1024,
        files: 1,
        fields: 10
      }
    });

    const fields = {};
    let fileBuffer = null;
    let fileMime = "application/octet-stream";
    let fileName = null;

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (name, file, info) => {
      fileMime = info?.mimeType || fileMime;
      fileName = info?.filename || null;

      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => reject(new Error("File too large (busboy limit reached)")));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, fileBuffer, fileMime, fileName }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    bb.end(body);
  });
}

export const handler = async (event) => {
  try {
    // OPTIONS (preflight) - חשוב במיוחד כשקוראים מ-extension / דפדפן
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS_HEADERS, body: "Method Not Allowed" };
    }

    // לוגים בסיסיים כדי לדעת אם בכלל הגיע multipart תקין
    console.log("[upload] isBase64Encoded:", event.isBase64Encoded);
    console.log("[upload] content-type:", event.headers?.["content-type"] || event.headers?.["Content-Type"]);

    const { fields, fileBuffer, fileMime, fileName } = await parseMultipart(event);

    console.log("[upload] fields:", fields);
    console.log("[upload] fileName:", fileName, "mime:", fileMime, "size:", fileBuffer?.length || 0);

    const sessionId = fields.sessionId;
    const idxRaw = fields.idx;

    if (!sessionId || idxRaw === undefined) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing sessionId or idx" })
      };
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing file" })
      };
    }

    const bucket = required("R2_BUCKET");

    // idx עם padding כדי שיהיה סדר
    const idx = String(Number(idxRaw)).padStart(6, "0");
    const key = `sessions/${sessionId}/chunks/${idx}.webm`;

    console.log("[upload] putting object:", { bucket, key });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: fileMime || "video/webm"
      })
    );

    console.log("[upload] OK:", key);

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ ok: true, key })
    };
  } catch (err) {
    console.error("[upload] ERROR:", err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err?.message || err) })
    };
  }
};
