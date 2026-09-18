// Direct Google Gemini API client (server-only).
// Uses GEMINI_API_KEY. Compatible request shape with our existing tool-calling pattern:
// callGeminiTool({ system, user, toolName, toolSchema }) -> parsed args object.

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface CallArgs {
  system: string;
  user: string;
  tool: ToolSchema;
  model?: string;
  timeoutMs?: number;
}

export async function callGeminiTool<T = Record<string, unknown>>(args: CallArgs): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model = args.model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { role: "system", parts: [{ text: args.system }] },
    contents: [{ role: "user", parts: [{ text: args.user }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: args.tool.name,
            description: args.tool.description,
            parameters: args.tool.parameters,
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [args.tool.name],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(args.timeoutMs ?? 30_000),
  });

  if (res.status === 429) throw new Error("Gemini rate limit reached. Try again shortly.");
  if (res.status === 401 || res.status === 403) {
    throw new Error("Gemini API key rejected (check GEMINI_API_KEY and billing).");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const fnCall = parts.find((p: { functionCall?: { name: string; args: unknown } }) => p.functionCall);
  if (!fnCall?.functionCall?.args) {
    throw new Error("No function call returned by Gemini");
  }
  return fnCall.functionCall.args as T;
}
