/**
 * Outreach Assistant model settings.
 * Server code reads OPENAI_OUTREACH_MODEL. The default is used when it is unset.
 * Do not prefix this with NEXT_PUBLIC — the browser must not choose the model.
 */

export const DEFAULT_OPENAI_OUTREACH_MODEL = "gpt-6.1-sol";

/** GPT-6.1 Sol default. Sampling parameters are unsupported at this effort. */
export const OUTREACH_REASONING_EFFORT = "medium" as const;

export const OUTREACH_TEXT_VERBOSITY = "medium" as const;

export const OUTREACH_PROMPT_CACHE_KEY = "lm-outreach-draft";

export const OUTREACH_QUICK_PROMPT_CACHE_KEY = "lm-account-outreach";

export const OUTREACH_RESEARCH_PROMPT_CACHE_KEY = "lm-outreach-market-research";

export const OUTREACH_MAX_OUTPUT_TOKENS = 4096;

export const OUTREACH_MAX_OUTPUT_TOKEN_CEILING = 8192;

export const OUTREACH_QUICK_MAX_OUTPUT_TOKENS = 2048;

export const OUTREACH_QUICK_MAX_OUTPUT_TOKEN_CEILING = 4096;

/** Shared CRM JSON calls. Reasoning tokens count toward this completion budget. */
export const CRM_JSON_MAX_COMPLETION_TOKENS = 8192;

export const CRM_REASONING_EFFORT = "medium" as const;

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

export function resolveOutreachModel(
  envValue: string | undefined | null,
): string {
  const trimmed = envValue?.trim();
  return trimmed || DEFAULT_OPENAI_OUTREACH_MODEL;
}

/**
 * GPT-5, GPT-6, and o-series reasoning models reject custom temperature.
 * gpt-4o-mini and similar chat models still accept it.
 */
export function modelSupportsCustomTemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return true;

  if (
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("gpt-6") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return false;
  }

  return true;
}

export function responseUsesRequestedModel(
  requested: string,
  actual: string | null | undefined,
): boolean {
  const asked = requested.trim().toLowerCase();
  const returned = actual?.trim().toLowerCase() ?? "";
  if (!asked || !returned) return false;
  return returned === asked || returned.startsWith(`${asked}-`);
}

export function buildJsonCompletionParams(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
  temperature?: number;
  reasoning_effort?: typeof CRM_REASONING_EFFORT;
  max_completion_tokens?: number;
} {
  const messages = [
    { role: "system" as const, content: input.systemPrompt },
    { role: "user" as const, content: input.userPrompt },
  ];
  const base = {
    model: input.model,
    messages,
    response_format: { type: "json_object" as const },
  };

  if (modelSupportsCustomTemperature(input.model)) {
    return { ...base, temperature: 0.3 };
  }

  return {
    ...base,
    reasoning_effort: CRM_REASONING_EFFORT,
    max_completion_tokens: CRM_JSON_MAX_COMPLETION_TOKENS,
  };
}

export function isRetryableOutreachError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    name?: unknown;
  };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : null;

  if (status !== null && RETRYABLE_HTTP_STATUSES.has(status)) {
    return true;
  }

  if (status !== null) return false;

  const name = typeof candidate.name === "string" ? candidate.name : "";
  return name === "APIConnectionError" || name === "APIConnectionTimeoutError";
}

export interface OutreachTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}

export function readResponseUsage(
  usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: {
          cached_tokens?: number;
          cache_write_tokens?: number;
        } | null;
        output_tokens_details?: { reasoning_tokens?: number } | null;
      }
    | null
    | undefined,
): OutreachTokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? null,
    cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: usage?.input_tokens_details?.cache_write_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

export interface ResponsesTextSource {
  output_text?: string | null;
  status?: string | null;
  incomplete_details?: { reason?: string | null } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string | null }>;
  }>;
}

export function extractResponsesOutputText(response: ResponsesTextSource): {
  text: string | null;
  status: string | null;
  incompleteReason: string | null;
} {
  const status = response.status ?? null;
  const incompleteReason = response.incomplete_details?.reason ?? null;
  const direct = response.output_text?.trim();
  if (direct) {
    return { text: direct, status, incompleteReason };
  }

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        parts.push(content.text.trim());
      }
    }
  }

  const text = parts.join("\n").trim();
  return { text: text || null, status, incompleteReason };
}

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return JSON.parse(fenced?.[1]?.trim() || trimmed);
}

export function nextOutreachAttempt(input: {
  status: string | null;
  incompleteReason: string | null;
  parsed: boolean;
  tokenBumped: boolean;
  maxOutputTokens: number;
  ceiling: number;
}): "accept" | "bump_tokens" | "fail" {
  if (input.parsed && input.status !== "failed") return "accept";

  if (
    input.incompleteReason === "max_output_tokens" &&
    !input.tokenBumped &&
    input.maxOutputTokens < input.ceiling
  ) {
    return "bump_tokens";
  }

  return "fail";
}

export function buildOutreachResponseBody(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  promptCacheKey: string;
}): {
  model: string;
  reasoning: { effort: typeof OUTREACH_REASONING_EFFORT };
  max_output_tokens: number;
  store: false;
  prompt_cache_key: string;
  input: Array<{ role: "system" | "user"; content: string }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: true;
      schema: Record<string, unknown>;
    };
    verbosity: typeof OUTREACH_TEXT_VERBOSITY;
  };
} {
  return {
    model: input.model,
    reasoning: { effort: OUTREACH_REASONING_EFFORT },
    max_output_tokens: input.maxOutputTokens,
    store: false,
    prompt_cache_key: input.promptCacheKey,
    input: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
      verbosity: OUTREACH_TEXT_VERBOSITY,
    },
  };
}
