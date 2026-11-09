import { generatePose, ProviderError } from "@/lib/ai/providers";
import { sanitizeAiPose, userPrompt } from "@/lib/ai/spec";

/**
 * POST /api/pose — turn a description into a pose.
 * Body: { prompt, current?: AiPose | null, previous?: string[] }
 * Returns: { pose: AiPose, provider, ms } or { error }.
 */

const MAX_PROMPT = 300;

// Per-visitor limit so a public demo can't drain the free quotas.
// In-memory: per server instance, which is plenty for this scale.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return false;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const started = performance.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip, Date.now())) return fail(429, "Too many poses at once — give it a few seconds.");

  let body: { prompt?: unknown; current?: unknown; previous?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : "";
  if (!prompt) return fail(400, "Describe a pose first.");
  const current = body.current ? sanitizeAiPose(body.current) : null;
  const previous = Array.isArray(body.previous)
    ? body.previous.filter((p): p is string => typeof p === "string").slice(-3).map((p) => p.slice(0, MAX_PROMPT))
    : [];

  try {
    const { pose, provider } = await generatePose(userPrompt(prompt, current, previous));
    return Response.json({ pose, provider, ms: Math.round(performance.now() - started) });
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 500;
    return fail(
      status === 429 ? 429 : 502,
      status === 429 ? "The free AI quota is busy right now — try again in a minute." : "Couldn't create that pose. Try again.",
    );
  }
}
