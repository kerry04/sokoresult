// Model-agnostic LLM gateway for pipeline analysis tasks (server-only).
//
// Default provider: OpenRouter, model inclusionai/ling-3.0-flash-vl:free
// (Inclusion AI Ling 3.0 Flash VL, 262K context, $0/M tokens, function-calling
// supported). Override with OPENROUTER_MODEL to swap models — any OpenRouter
// slug works, which is the fallback path if Ling's free tier is unavailable.
// Gemini is fully retired: no pipeline code calls it directly anymore —
// everything routes through callLlmTool.
//
// Contract (same as the old callGeminiTool):
//   callLlmTool({ system, user, tool }) -> parsed tool-call arguments object.
// A strict "only the JSON object" suffix is appended to the system prompt so
// models without native function-calling still return structured output.

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash-vl:free";

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CallArgs {
  system: string;
  user: string;
  tool: ToolSchema;
  model?: string;
  timeoutMs?: number;
}

const RETRIES = 2;            // 2 retries => up to 3 attempts total
const RETRY_DELAY_MS = 5_000; // spec: five-second delay between attempts

// Degraded mode: after 3 consecutive failed invocations, fail fast for 60s
// instead of burning timeouts on every request. Callers catch the thrown
// error and apply their task-specific fallbacks.
const COOLDOWN_MS = 60_000;
const COOLDOWN_THRESHOLD = 3;
let consecutiveFailures = 0;
let cooldownUntil = 0;

const JSON_SUFFIX =
  "\n\nIMPORTANT: Respond with ONLY a single call to the tool described, or, " +
  "if tool calls are unavailable in this environment, respond with ONLY a " +
  "valid JSON object matching the tool's parameters schema. No prose, no " +
  "markdown fences.";

/** True while the LLM layer is in degraded (fast-fail) mode. */
export function isLlmDegraded(): boolean {
  return Date.now() < cooldownUntil;
}

async function extractJson(text: string): Promise<Record<string, unknown>> {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(t.slice(start, end + 1));
}

async function callOnce<T>(args: CallArgs): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.LLM_APP_URL || "https://sokoresult.vercel.app",
      "X-Title": "SokoResult",
    },
    body: JSON.stringify({
      model: args.model || DEFAULT_MODEL,
      messages: [
        { role: "system", content: args.system + JSON_SUFFIX },
        { role: "user", content: args.user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: args.tool.name,
            description: args.tool.description,
            parameters: args.tool.parameters,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: args.tool.name } },
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 30_000),
  });

  if (res.status === 429) throw new Error("LLM rate limit reached (429).");
  if (res.status === 401 || res.status === 403) {
    throw new Error("LLM API key rejected (check OPENROUTER_API_KEY).");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  const choice = json?.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    const fn = toolCalls[0]?.function;
    if (typeof fn?.arguments === "string") return JSON.parse(fn.arguments) as T;
    return fn?.arguments as T;
  }
  // No native tool call — model answered with text; parse the JSON object.
  const content: string = choice?.message?.content ?? "";
  return (await extractJson(content)) as T;
}

export async function callLlmTool<T = Record<string, unknown>>(args: CallArgs): Promise<T> {
  if (isLlmDegraded()) {
    throw new Error("LLM layer in degraded mode (provider recently failing).");
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const out = await callOnce<T>(args);
      consecutiveFailures = 0;
      return out;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  consecutiveFailures++;
  if (consecutiveFailures >= COOLDOWN_THRESHOLD) cooldownUntil = Date.now() + COOLDOWN_MS;
  throw lastErr;
}
