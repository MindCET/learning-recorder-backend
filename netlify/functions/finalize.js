export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const sessionId = body.sessionId;

    if (!sessionId) {
      return { statusCode: 400, body: "Missing sessionId" };
    }

    // MVP: לא עושה merge. רק מאשר סיום.
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        message: "Finalized (chunks are stored).",
        prefix: `sessions/${sessionId}/chunks/`
      })
    };
  } catch (err) {
    console.error("finalize error:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err?.message || err) })
    };
  }
};
