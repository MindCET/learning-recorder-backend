import { S3RequestPresigner } from "@aws-sdk/s3-request-presigner";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";

export async function handler(event) {
  const { sessionId, idx } = event.queryStringParameters || {};

  const key = `sessions/${sessionId}/chunks/${idx}.webm`;

  const presigner = new S3RequestPresigner({
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    sha256: Sha256,
  });

  const request = new HttpRequest({
    method: "PUT",
    protocol: "https:",
    hostname: new URL(process.env.R2_ENDPOINT).hostname,
    path: `/${process.env.R2_BUCKET}/${key}`,
    headers: {
      host: new URL(process.env.R2_ENDPOINT).hostname,
    },
  });

  const signed = await presigner.presign(request, { expiresIn: 60 });

  return {
    statusCode: 200,
    body: JSON.stringify({
      url: `${signed.protocol}//${signed.hostname}${signed.path}?${signed.query}`,
      key,
    }),
  };
}
