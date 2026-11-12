import "server-only";

import { AI_POSE_SCHEMA, sanitizeAiPose, systemPrompt, type AiPose } from "./spec";

/**
 * Pose generation backends. Groq first (fastest), Gemini as the fallback
 * when Groq is rate-limited, down, or returns something unusable.
 * Both are free tiers; keys live only on the server (.env.local).
 */

export type Provider = "groq" | "gemini";

export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly status: number,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}

const TIMEOUT_MS = 9_000;
const SYSTEM = systemPrompt();

async function postJson(provider: Provider, url: string, headers: Record<string, string>, body: unknown, timeout = TIMEOUT_MS) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(provider, res.status, text.slice(0, 300));
  return JSON.parse(text);
}

function parsePose(provider: Provider, text: string | undefined): AiPose {
  let raw: unknown;
  try {
    raw = JSON.parse(text ?? "");
  } catch {
    throw new ProviderError(provider, 502, "response was not JSON");
  }
  const pose = sanitizeAiPose(raw);
  if (!pose) throw new ProviderError(provider, 502, "response did not match the pose shape");
  return pose;
}

async function callGroq(user: string): Promise<AiPose> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new ProviderError("groq", 500, "GROQ_API_KEY is not set");
  const data = await postJson(
    "groq",
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${key}` },
    {
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      // Strict mode: constrained decoding, so the JSON always matches.
      response_format: { type: "json_schema", json_schema: { name: "pose", strict: true, schema: AI_POSE_SCHEMA } },
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: 2048,
      stream: false,
    },
  );
  if (process.env.NODE_ENV === "development") console.info("[pose] groq usage", JSON.stringify(data?.usage));
  return parsePose("groq", data?.choices?.[0]?.message?.content);
}

/**
 * Flash reasons about bodies better than Flash-Lite, so Flash first (with a
 * little thinking: reading the request right matters more than a second),
 * and Lite only if Flash is overloaded, rate-limited or slow. Since postures
 * and hand targets are named choices, even Lite gets the support right.
 */
const GEMINI_MODELS = [
  { model: "gemini-3.5-flash", timeout: 8_000, thinking: "low" },
  { model: "gemini-3.5-flash-lite", timeout: TIMEOUT_MS, thinking: "minimal" },
];

async function callGeminiModel(user: string, model: string, timeout: number, thinking: string): Promise<AiPose> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ProviderError("gemini", 500, "GEMINI_API_KEY is not set");
  const data = await postJson(
    "gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: AI_POSE_SCHEMA,
        thinkingConfig: { thinkingLevel: thinking },
      },
    },
    timeout,
  );
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  return parsePose("gemini", text);
}

async function callGemini(user: string): Promise<AiPose> {
  let last: unknown;
  for (const { model, timeout, thinking } of GEMINI_MODELS) {
    try {
      return await callGeminiModel(user, model, timeout, thinking);
    } catch (e) {
      last = e;
      console.warn(`[pose] ${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw last;
}

/** If Groq (normally ~1.3 s) hasn't answered by now, start Gemini alongside it. */
const HEDGE_MS = 3000;

/**
 * Hedged request: Groq first; Gemini joins if Groq fails or is slow. The
 * first good pose wins. Keeps the usual case fast and bounds the worst case
 * when a free-tier request stalls.
 */
export function generatePose(user: string): Promise<{ pose: AiPose; provider: Provider }> {
  return new Promise((resolve, reject) => {
    const errors: ProviderError[] = [];
    let settled = false;
    let started = 0;
    let finished = 0;

    const attempt = (provider: Provider, call: (u: string) => Promise<AiPose>) => {
      started++;
      call(user).then(
        (pose) => {
          finished++;
          if (settled) return;
          settled = true;
          clearTimeout(hedge);
          resolve({ pose, provider });
        },
        (e) => {
          finished++;
          const err = e instanceof ProviderError ? e : new ProviderError(provider, 502, String(e));
          console.warn(`[pose] ${err.message}`);
          errors.push(err);
          if (settled) return;
          if (provider === "groq" && started === 1) {
            clearTimeout(hedge);
            attempt("gemini", callGemini);
          } else if (finished === started) {
            settled = true;
            const rateLimited = errors.every((x) => x.status === 429);
            reject(new ProviderError(provider, rateLimited ? 429 : 502, "all providers failed"));
          }
        },
      );
    };

    const hedge = setTimeout(() => {
      if (!settled && started === 1) attempt("gemini", callGemini);
    }, HEDGE_MS);
    attempt("groq", callGroq);
  });
}
