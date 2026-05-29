// Anthropic SDK init + the canonical Haiku call wrapper.
//
// The model name is HARDCODED here — `claude-haiku-4-5`. There is no
// env switch and that's deliberate: the workspace this API key lives
// in has a £30/month spending cap (set in console.anthropic.com),
// which is the safety net. Hardcoding the model means:
//   1. We can't accidentally run Sonnet/Opus copy assist (~10× cost).
//   2. Reading code tells you exactly what model produced the copy.
//
// Failure mode: every call returns null on error rather than throwing.
// Polish is a NICE-TO-HAVE — if Anthropic is down, billing tripped,
// rate-limited, or the response shape is unexpected, the build still
// ships using the customer's raw text. Errors are logged so we notice.
//
// Concurrency: the SDK creates one client; we lazily init on first call
// to avoid pulling network deps into cold-start paths that don't need
// them. The marketing-site Worker (where this runs) handles many
// requests but only the build path calls Haiku, so init cost is
// amortised over the few builds per day.
//
// Note on token budget: each polish call sends ~150 input tokens and
// caps output at 300. At Haiku 4.5 pricing (£0.001/1k in, £0.005/1k
// out as of writing), a fully-polished site (~30 calls — tagline +
// blurb + ~6 services + ~10 FAQs) costs <£0.20. Cache means rebuilds
// of unchanged text cost £0.

import Anthropic from "@anthropic-ai/sdk";
import { getServerEnv } from "../env";

/** The exact model identifier. Don't parameterise this. */
export const HAIKU_MODEL = "claude-haiku-4-5";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  // Use the optional accessor — if the key isn't set, we just skip
  // polishing rather than 500ing the build.
  let apiKey: string | undefined;
  try {
    apiKey = getServerEnv().ANTHROPIC_API_KEY;
  } catch {
    return null;
  }
  if (!apiKey) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * One-shot text completion via Haiku 4.5. Returns the polished
 * string on success, or null on any failure (logged to stderr —
 * shows up in `wrangler tail` for debugging without breaking the
 * build). Caller falls back to raw input on null.
 *
 * `system` sets the persona / constraints (kept short — 1-2
 * sentences). `prompt` is the raw text to polish, prefixed by what
 * we want done with it.
 */
export async function callHaiku(args: {
  system: string;
  prompt: string;
  /** Max output tokens. Polish prompts are short; default 300. */
  maxTokens?: number;
  /** Override temperature. Default 0.6 (tuned for copy polish).
   *  Use lower values (0.1-0.2) for structured JSON output. */
  temperature?: number;
}): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.warn(
      "[haiku] ANTHROPIC_API_KEY not set — skipping polish (raw text used).",
    );
    return null;
  }
  try {
    const res = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: args.maxTokens ?? 300,
      // Slightly creative but not wild — copy should sound human, not
      // hallucinate facts. 0.6 is the sweet spot we tuned to in
      // testing; lower than 0.4 gets sterile, higher than 0.8 starts
      // adding embellishments the customer didn't write.
      temperature: args.temperature ?? 0.6,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
    });
    // Response shape: content is an array of blocks; we only ever
    // ask for plain text so block[0] should be a text block.
    const block = res.content[0];
    if (!block || block.type !== "text") {
      console.warn("[haiku] unexpected response shape", res.content);
      return null;
    }
    const out = block.text.trim();
    if (out.length === 0) return null;
    if (looksLikeRefusal(out)) {
      console.warn(
        `[haiku] model refused to polish (raw input not usable). ` +
          `Falling back to raw text. First 80 chars: ${out.slice(0, 80)}`,
      );
      return null;
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[haiku] call failed: ${msg}`);
    return null;
  }
}

/**
 * Heuristic check for "I refuse to polish this" responses. Haiku
 * (correctly) won't invent business facts, so when the customer's
 * input is genuinely unusable (test data, gibberish, off-topic),
 * the model says so in prose instead of polishing — and that prose
 * was getting baked into the customer's site. Catch it here, return
 * null, fall back to raw input.
 *
 * Conservative: only matches patterns that literally describe the
 * model's inability or a request for more info. Won't trigger on
 * legitimate polish output that happens to use words like "can".
 */
function looksLikeRefusal(text: string): boolean {
  const lower = text.toLowerCase();
  // Strong refusal markers — the model is talking to us, not the
  // site visitor. These are statements ABOUT the input rather than
  // polished prose FROM the input.
  const markers = [
    "i can't polish",
    "i cannot polish",
    "i'm unable to",
    "i am unable to",
    "please share",
    "please provide",
    "doesn't contain",
    "does not contain",
    "appears to be a",
    "no actual information",
    "no real content",
    "system note",
    "placeholder",
    "test data",
    "test save",
  ];
  return markers.some((m) => lower.includes(m));
}
