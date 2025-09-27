// src/controllers/agentInvoke.controller.js
/**
 * RPC-style endpoint to invoke an agent intent directly (router.route).
 * Expects body: { intent: "mar.batch_release", context: {...}, text?: "..." }
 *
 * Returns: { ok: true, intent, routing }
 */

function withTimeout(promise, ms, label = "agent.route") {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function invokeAgentController(req, res) {
  try {
    const { intent, context = {}, text } = req.body || {};
    if (!intent || typeof intent !== "string") {
      return res.status(422).json({ ok: false, error: "Missing 'intent' (string) in body" });
    }

    const { router } = req.locals || {};
    if (!router || typeof router.route !== "function") {
      return res.status(500).json({ ok: false, error: "Router not available" });
    }

    // caller meta for auditing or downstream logic
    const caller = {
      apiKey: req.headers["x-api-key"] || null,
      role: req.headers["x-role"] || null,
      auth: req.headers["authorization"] || null,
      userAgent: req.headers["user-agent"] || null,
      ip: req.ip || req.socket?.remoteAddress || null,
    };

    const payload = {
      intent,
      text: text || intent,
      context: { ...context, invokedBy: caller },
    };

    // route with timeout
    const routing = await withTimeout(router.route(payload), 15000, "agent.route");

    return res.json({ ok: true, intent, routing });
  } catch (e) {
    console.error("[AGENT INVOKE ERROR]", e);
    const status = /timeout/i.test(String(e?.message)) ? 504 : 500;
    return res.status(status).json({ ok: false, error: e?.message || String(e) });
  }
}
