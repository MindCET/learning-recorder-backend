export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Netlify Functions תומך ב-crypto ברוב המקרים, אבל נעשה fallback:
  const sessionId =
    (globalThis.crypto?.randomUUID && crypto.randomUUID()) ||
    `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, sessionId })
  };
};
