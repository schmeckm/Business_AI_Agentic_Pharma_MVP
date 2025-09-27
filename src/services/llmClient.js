// src/services/llmClient.js
import logger from "./logger.js";

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();
// For OpenAI use LLM_API_KEY; for Anthropic use ANTHROPIC_API_KEY
const OPENAI_KEY = process.env.LLM_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Ask the LLM to parse a German scheduling command and return JSON:
 * { material, qty, line, country, date }
 *
 * Returns null if not available or if parsing failed.
 */
export async function parseSlotsWithLLM(message, opts = {}) {
  if (LLM_PROVIDER === "openai" && !OPENAI_KEY) {
    logger.debug("LLM parse skipped: OPENAI key missing");
    return null;
  }
  if (LLM_PROVIDER === "anthropic" && !ANTHROPIC_KEY) {
    logger.debug("LLM parse skipped: ANTHROPIC key missing");
    return null;
  }

  const system = `Du bist ein strukturiertes Parser-Tool. Extrahiere aus dem deutschen Text die Felder:
- material (z.B. FG-123),
- qty (ganzzahlig, Anzahl Stück),
- line (z.B. PCK-01),
- country (EU/US/ROW/CH/DE/FR),
- date (ISO YYYY-MM-DD wenn genannt, sonst leer).

Antworte ausschließlich mit validem JSON und ohne zusätzlichen Text. Beispiel:
{"material":"FG-123","qty":4000,"line":"PCK-01","country":"EU","date":"2025-09-15"}`;

  const user = `Text: """${message.replace(/"""|\\/g, "")}""" \n\nGib nur JSON zurück.`;

  try {
    if (LLM_PROVIDER === "anthropic") {
      // Anthropic Claude (simple HTTP)
      const res = await fetch("https://api.anthropic.com/v1/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-2.1",
          prompt: `${system}\n\n${user}`,
          max_tokens: 400,
          temperature: 0.0
        })
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, "anthropic parse failed");
        return null;
      }
      const j = await res.json();
      const text = j?.completion || j?.output ?? "";
      return safeParseJsonFromString(text);
    } else {
      // OpenAI Chat Completions
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature: 0.0,
          max_tokens: 400
        })
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, "openai parse failed");
        return null;
      }
      const j = await res.json();
      const text = j?.choices?.[0]?.message?.content ?? "";
      return safeParseJsonFromString(text);
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "parseSlotsWithLLM failed");
    return null;
  }
}

/** Try to extract first JSON object substring and parse it safely */
function safeParseJsonFromString(s) {
  if (!s || typeof s !== "string") return null;
  // find first { ... } block
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const chunk = s.slice(start, end + 1);
  try {
    const parsed = JSON.parse(chunk);
    // normalize fields
    const normalized = {
      material: parsed.material || parsed.materialCode || parsed.mat || null,
      qty: parsed.qty ? Number(parsed.qty) : (parsed.quantity ? Number(parsed.quantity) : null),
      line: parsed.line || parsed.linie || null,
      country: parsed.country || parsed.region || null,
      date: parsed.date || parsed.due || null
    };
    return normalized;
  } catch (e) {
    logger.debug({ err: e?.message }, "safeParseJsonFromString parse error");
    return null;
  }
}
