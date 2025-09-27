// src/controllers/chat.controller.js
import { setTimeout as wait } from "timers/promises";

/**
 * Helper: race with timeout
 */
function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/* -----------------------
   Fallback parser (Deutsch)
   - Material FG-123
   - Menge (4.000 / 4 000 / 4'000 / 4000 Stk)
   - Linie PCK-01
   - Land in EU/US/ROW/CH/DE/FR
   - Datum: "morgen" -> +1 Tag
   ----------------------- */
function parseDateFromMessage(msg) {
  if (/\bmorgen\b/i.test(msg)) {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
  // optional: parse "am 2025-09-15"
  const m = msg.match(/\b(?:am\s*)?([0-9]{4}-[0-9]{2}-[0-9]{2})\b/);
  if (m) return m[1];
  return new Date().toISOString().slice(0, 10);
}

function parseGermanCommandFallback(msg) {
  // Material
  const mMatFG = msg.match(/\bFG-\d{2,}\b/i);
  const mMatFor = msg.match(/\bf(?:ür|or)\s+([A-Z0-9-]+)/i);
  const material = (mMatFG?.[0] || mMatFor?.[1] || "FG-123")
    .toUpperCase()
    .replace(/[.,;:]$/, "");

  // Menge (only if followed by unit)
  const qtyAll = Array.from(
    msg.matchAll(/(\d{1,3}(?:[.\s',]\d{3})*|\d+)\s*(?:stk|stück|pcs)\b/gi)
  );
  const qtyMatch = qtyAll.length ? qtyAll[qtyAll.length - 1] : null;
  const qtyRaw = qtyMatch ? qtyMatch[1].replace(/[.\s',]/g, "") : null;
  const qty = qtyRaw ? Number(qtyRaw) : 0;

  // Linie
  const mLine = msg.match(/\bPCK-\d{2}\b/i) || msg.match(/\bLinie\s+([A-Z0-9-]+)\b/i);
  const line = (Array.isArray(mLine) ? mLine[1] : mLine?.[0]) || "PCK-01";

  // Land
  const mCountry = msg.match(/\bin\s+(EU|US|ROW|CH|DE|FR)\b/i);
  let country = (mCountry?.[1] || "EU").toUpperCase();
  if (country === "DE" || country === "FR" || country === "CH") country = "EU";

  // Datum
  const date = parseDateFromMessage(msg);

  return { material, qty, line: line.toUpperCase(), country, date };
}

/* -----------------------
   LLM NLU: frage das LLM (Claude) nach JSON
   - gibt ein Object mit keys zurück oder wir nutzen Fallback
   ----------------------- */
async function tryLLMNLU(llm, text, timeoutMs = 5000) {
  if (!llm || typeof llm.chat !== "function") {
    return null;
  }

  const system = `You are a strict NLU extractor for manufacturing scheduling commands.
Output MUST be valid JSON only (no commentary). Required keys:
material (string|null), qty (integer|null), line (string|null), date (YYYY-MM-DD|null), country (string|null).
If a value is not present, set it to null.
Do NOT output anything else.`;

  const user = `Text: """${text.replace(/"""/g, '\\"""')}"""
Return JSON only.`;

  try {
    const r = await withTimeout(
      llm.chat(
        [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        { temperature: 0, max_tokens: 250 }
      ),
      timeoutMs,
      "llm.nlu"
    );

    // r.text should be JSON - try parse tolerantly
    const txt = (r && (r.text || r.completion || r.raw && JSON.stringify(r.raw))) || "";
    // attempt to find first JSON substring if model returned extra
    const jsonStart = txt.indexOf("{");
    const jsonEnd = txt.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const candidate = txt.slice(jsonStart, jsonEnd + 1);
      try {
        const parsed = JSON.parse(candidate);
        // normalize basic types
        if (parsed && typeof parsed === "object") {
          return {
            material: parsed.material ?? null,
            qty: parsed.qty != null ? Number(parsed.qty) : null,
            line: parsed.line ?? null,
            date: parsed.date ?? null,
            country: parsed.country ?? null,
            raw: txt
          };
        }
      } catch (e) {
        // Fallthrough to return null -> regex fallback
      }
    }
    return null;
  } catch (e) {
    // LLM failed / timed out
    console.warn("[CHAT] LLM NLU failed:", e?.message || e);
    return null;
  }
}

/* -----------------------
   Controller
   ----------------------- */
export async function chatController(req, res) {
  try {
    const { message: incomingMessage, promptId } = req.body || {};
    if ((typeof incomingMessage !== "string" || !incomingMessage?.trim()) && !promptId) {
      return res.status(422).json({ error: "Body must include 'message' (string) or 'promptId'." });
    }

    // DI'd services
    const { router, llm, data, cfg } = req.locals || {};
    if (!router || typeof router.route !== "function") {
      return res.status(500).json({ error: "Router not available on server" });
    }

    // prompt templates (simple)
    const promptTemplates = {
      "ask-today-orders": "Liste alle Aufträge auf, die heute zur Freigabe anstehen und gib den Status (releasable/blocked) je Auftrag an.",
      "explain-order": "Zeige alle Stammdaten und Abhängigkeiten für Order {orderId}.",
      "general-assessment": "Bewerte die Produktionsfreigabe für die nächsten 24h und liste Risiken auf."
    };

    // canonical text (message or template)
    let text = incomingMessage?.trim() || "";
    if (!text && promptId && promptTemplates[promptId]) text = promptTemplates[promptId];

    // allow simple placeholder replacement in templates (e.g., {orderId} present in body)
    const placeholders = req.body?.placeholders || {};
    for (const [k, v] of Object.entries(placeholders || {})) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }

    console.debug("[CHAT] incoming text:", text);

    // 1) Try LLM based NLU (strict JSON). Timeout small to not block main flow.
    let nlu = null;
    try {
      nlu = await tryLLMNLU(llm, text, Number(cfg?.LLM_NLU_TIMEOUT_MS || 4000));
      if (nlu) {
        console.debug("[CHAT] LLM NLU parsed:", nlu);
      } else {
        console.debug("[CHAT] LLM NLU returned null -> falling back to regex parser");
      }
    } catch (e) {
      console.warn("[CHAT] error during LLM NLU:", e?.message || e);
      nlu = null;
    }

    // 2) If LLM couldn't parse, use regex fallback
    let parsed;
    if (!nlu) {
      parsed = parseGermanCommandFallback(text);
      console.debug("[CHAT] fallback parsed:", parsed);
    } else {
      parsed = {
        material: (nlu.material || null) ? String(nlu.material).toUpperCase() : null,
        qty: Number.isFinite(Number(nlu.qty)) ? Number(nlu.qty) : 0,
        line: nlu.line ? String(nlu.line).toUpperCase() : "PCK-01",
        country: nlu.country ? String(nlu.country).toUpperCase() : "EU",
        date: nlu.date || parseDateFromMessage(text)
      };
      // fill defaults for missing numeric qty from fallback as last resort
      if (!parsed.qty || parsed.qty <= 0) {
        const fb = parseGermanCommandFallback(text);
        if (fb.qty && fb.qty > 0) parsed.qty = fb.qty;
      }
      // date fallback
      if (!parsed.date) parsed.date = parseDateFromMessage(text);
      // material fallback
      if (!parsed.material || parsed.material === "NULL") parsed.material = (parseGermanCommandFallback(text).material || "FG-123");
    }

    // final validation
    const qty = Number(parsed.qty || 0);
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      return res.status(422).json({ error: "Bitte eine gültige Menge angeben (z. B. 4000 Stk)." });
    }

    // Build agent context (include data + llm + router + broadcast)
    const context = {
      line: parsed.line || "PCK-01",
      date: parsed.date,
      material: parsed.material || "FG-123",
      qty,
      country: parsed.country || "EU",
      promptId,
      message: text,
      // pass services so agent can call data/getBom/... and also llm if needed
      data,
      llm,
      router, // optional, agents may call router.route for a2a
      broadcast: req.app?.get("broadcast") || (msg => console.debug("[CHAT] broadcast fallback:", msg))
    };

    console.info("[CHAT] parsed before route:", { material: context.material, qty: context.qty, line: context.line, country: context.country, date: context.date });

    // Route to the business agent (with timeout)
    const intent = "business.request";
    const routing = await withTimeout(router.route({ intent, text, context }), 20000, "agent.route");

    return res.json({ intent, routing });
  } catch (e) {
    console.error("[CHAT ERROR]", e);
    const status = /timeout/i.test(String(e?.message)) ? 504 : 500;
    return res.status(status).json({ error: e?.message || "Internal error" });
  }
}
