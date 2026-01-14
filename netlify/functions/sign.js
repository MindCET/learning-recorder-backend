const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

exports.handler = async (event) => {
  const { sessionId, idx } = event.queryStringParameters || {};
  if (!sessionId || idx == null) {
    return { statusCode: 400, body: "Missing sessionId or idx" };
  }

  const key = `sessions/${sessionId}/chunks/${idx}.webm`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    ContentType: "video/webm"
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 60 });

  return {
    statusCode: 200,
    body: JSON.stringify({ url, key })
  };
};
