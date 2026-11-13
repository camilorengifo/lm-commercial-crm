import OpenAI from "openai";
import {
  AI_CLIENT_ERROR_MESSAGE,
  createAiErrorRef,
  formatAiClientError,
} from "@/lib/aiConstants";
import { OPENAI_MODEL, OPENAI_OUTREACH_MODEL } from "@/lib/openai-config";
import {
  buildOutreachResponseBody,
  extractResponsesOutputText,
  isRetryableOutreachError,
  nextOutreachAttempt,
  OUTREACH_MAX_OUTPUT_TOKEN_CEILING,
  OUTREACH_MAX_OUTPUT_TOKENS,
  OUTREACH_RESEARCH_PROMPT_CACHE_KEY,
  modelSupportsCustomTemperature,
  parseModelJson,
  readResponseUsage,
  type OutreachTokenUsage,
} from "@/lib/outreachModel";

export { AI_CLIENT_ERROR_MESSAGE };
export { OPENAI_MODEL, OPENAI_OUTREACH_MODEL };

export class OpenAIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIConfigurationError";
  }
}

export function openAiKeyExists(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIKey(): string {
  const trimmed = (process.env.OPENAI_API_KEY ?? "").trim();

  if (!trimmed) {
    throw new OpenAIConfigurationError("OPENAI_API_KEY is missing.");
  }

  return trimmed;
}

export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: getOpenAIKey() });
}

export function getOpenAIModel(): string {
  return OPENAI_MODEL;
}

export function getOutreachModel(): string {
  return OPENAI_OUTREACH_MODEL;
}

function redactSecrets(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[REDACTED_RESEND_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/OPENAI_API_KEY=\S+/gi, "OPENAI_API_KEY=[REDACTED]")
    .replace(/RESEND_API_KEY=\S+/gi, "RESEND_API_KEY=[REDACTED]");
}

export { modelSupportsCustomTemperature };

interface OpenAiSafeDiagnostics {
  ref: string;
  selectedModel: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string;
  requestId: string | null;
}

function extractOpenAiDiagnostics(
  error: unknown,
  model: string,
  ref = createAiErrorRef(),
): OpenAiSafeDiagnostics {
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  let errorType: string | null = null;
  let requestId: string | null = null;
  let rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown_error";

  if (error && typeof error === "object") {
    const apiError = error as {
      status?: number;
      code?: string | null;
      type?: string | null;
      message?: string;
      requestID?: string | null;
      request_id?: string | null;
      error?: {
        code?: string | null;
        type?: string | null;
        message?: string;
      };
      headers?: Headers | { get?: (name: string) => string | null };
    };

    if (typeof apiError.status === "number") {
      httpStatus = apiError.status;
    }

    errorCode = apiError.code ?? apiError.error?.code ?? null;
    errorType = apiError.type ?? apiError.error?.type ?? null;
    requestId =
      apiError.requestID ??
      apiError.request_id ??
      (typeof apiError.headers?.get === "function"
        ? apiError.headers.get("x-request-id")
        : null) ??
      null;

    if (apiError.error?.message) {
      rawMessage = apiError.error.message;
    } else if (apiError.message) {
      rawMessage = apiError.message;
    }
  }

  return {
    ref,
    selectedModel: model,
    httpStatus,
    errorCode: errorCode ? String(errorCode) : null,
    errorType: errorType ? String(errorType) : null,
    errorMessage: redactSecrets(rawMessage).slice(0, 500),
    requestId: requestId ? String(requestId) : null,
  };
}

function logOpenAiFailure(
  diagnostics: OpenAiSafeDiagnostics,
  context?: string,
): void {
  console.error(
    `[openai] AI request failed${context ? ` (${context})` : ""}`,
    diagnostics,
  );
}

export function sanitizeAiError(
  error: unknown,
  context?: string,
  model = getOpenAIModel(),
): string {
  const diagnostics = extractOpenAiDiagnostics(error, model);
  logOpenAiFailure(diagnostics, context);
  return formatAiClientError(diagnostics.ref);
}

export async function generateJsonCompletion<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  context?: string;
}): Promise<{ data: T | null; error: string | null }> {
  let client: OpenAI;

  try {
    client = getOpenAIClient();
  } catch (error) {
    return {
      data: null,
      error: sanitizeAiError(error, input.context ?? "getOpenAIClient"),
    };
  }

  const model = input.model ?? getOpenAIModel();
  const requestContext = input.context ?? "generateJsonCompletion";

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
    {
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    };

  if (modelSupportsCustomTemperature(model)) {
    params.temperature = 0.3;
  }

  try {
    const response = await client.chat.completions.create(params);

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      const ref = createAiErrorRef();
      logOpenAiFailure(
        {
          ref,
          selectedModel: model,
          httpStatus: 200,
          errorCode: "empty_completion",
          errorType: "empty_response",
          errorMessage: "Model returned an empty message content.",
          requestId: response.id ?? null,
        },
        requestContext,
      );
      return {
        data: null,
        error: formatAiClientError(ref),
      };
    }

    try {
      return { data: JSON.parse(content) as T, error: null };
    } catch (parseError) {
      const ref = createAiErrorRef();
      logOpenAiFailure(
        {
          ref,
          selectedModel: model,
          httpStatus: 200,
          errorCode: "json_parse_error",
          errorType: "parse_error",
          errorMessage: redactSecrets(
            parseError instanceof Error
              ? parseError.message
              : "Failed to parse model JSON.",
          ).slice(0, 500),
          requestId: response.id ?? null,
        },
        requestContext,
      );
      return {
        data: null,
        error: formatAiClientError(ref),
      };
    }
  } catch (error) {
    return {
      data: null,
      error: sanitizeAiError(error, requestContext, model),
    };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function logOutreachUsage(
  context: string,
  details: {
    model: string;
    latencyMs: number;
    status: string | null;
    attempt: number;
    usage: OutreachTokenUsage;
  },
): void {
  console.info(`[openai] outreach usage (${context})`, {
    model: details.model,
    latencyMs: details.latencyMs,
    status: details.status,
    attempt: details.attempt,
    inputTokens: details.usage.inputTokens,
    outputTokens: details.usage.outputTokens,
    reasoningTokens: details.usage.reasoningTokens,
    cachedInputTokens: details.usage.cachedInputTokens,
    cacheWriteTokens: details.usage.cacheWriteTokens,
    totalTokens: details.usage.totalTokens,
  });
}

/**
 * Outreach Assistant generation. Uses the Responses API, medium reasoning,
 * and the outreach model only. Draft generation does not write CRM records
 * or contact customers, so one transient retry and one output-token increase
 * are safe. Sampling parameters are omitted because reasoning effort is set.
 */
export async function generateOutreachJson<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  promptCacheKey: string;
  context?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxOutputTokenCeiling?: number;
}): Promise<{ data: T | null; error: string | null }> {
  const model = getOutreachModel();
  const requestContext = input.context ?? "generateOutreachJson";

  let client: OpenAI;
  try {
    client = getOpenAIClient();
  } catch (error) {
    return {
      data: null,
      error: sanitizeAiError(error, requestContext, model),
    };
  }

  const timeoutMs = input.timeoutMs ?? 70_000;
  let maxOutputTokens = input.maxOutputTokens ?? OUTREACH_MAX_OUTPUT_TOKENS;
  const ceiling = Math.max(
    maxOutputTokens,
    input.maxOutputTokenCeiling ?? OUTREACH_MAX_OUTPUT_TOKEN_CEILING,
  );
  let tokenBumped = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const response = await client.responses.create(
        buildOutreachResponseBody({
          model,
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          schemaName: input.schemaName,
          schema: input.schema,
          maxOutputTokens,
          promptCacheKey: input.promptCacheKey,
        }),
        { timeout: timeoutMs, maxRetries: 0 },
      );

      const extracted = extractResponsesOutputText(response);
      logOutreachUsage(requestContext, {
        model: response.model || model,
        latencyMs: Date.now() - started,
        status: extracted.status,
        attempt,
        usage: readResponseUsage(response.usage),
      });

      let parsed: unknown = null;
      let parsedOk = false;
      if (extracted.text) {
        try {
          parsed = parseModelJson(extracted.text);
          parsedOk = true;
        } catch {
          parsedOk = false;
        }
      }

      const decision = nextOutreachAttempt({
        status: extracted.status,
        incompleteReason: extracted.incompleteReason,
        parsed: parsedOk,
        tokenBumped,
        maxOutputTokens,
        ceiling,
      });

      if (decision === "bump_tokens" && attempt < 2) {
        tokenBumped = true;
        maxOutputTokens = ceiling;
        continue;
      }

      if (decision === "accept" && parsedOk) {
        return { data: parsed as T, error: null };
      }

      const ref = createAiErrorRef();
      const responseError = response.error;
      logOpenAiFailure(
        {
          ref,
          selectedModel: response.model || model,
          httpStatus: 200,
          errorCode:
            extracted.incompleteReason ?? responseError?.code ?? "incomplete_response",
          errorType: extracted.status ?? "incomplete_response",
          errorMessage: redactSecrets(
            responseError?.message ||
              "Outreach model did not return a completed draft.",
          ).slice(0, 500),
          requestId: response.id ?? null,
        },
        requestContext,
      );
      return { data: null, error: formatAiClientError(ref) };
    } catch (error) {
      if (attempt === 1 && isRetryableOutreachError(error)) {
        await wait(600);
        continue;
      }
      return {
        data: null,
        error: sanitizeAiError(error, requestContext, model),
      };
    }
  }

  return {
    data: null,
    error: sanitizeAiError(
      new Error("Outreach generation did not complete."),
      requestContext,
      model,
    ),
  };
}

export async function createWebSearchResponse(input: {
  systemPrompt: string;
  userPrompt: string;
  context?: string;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutMs?: number;
  userLocation?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
    timezone?: string | null;
  };
}): Promise<{
  text: string | null;
  citations: Array<{ url: string; title: string }>;
  error: string | null;
}> {
  let client: OpenAI;

  try {
    client = getOpenAIClient();
  } catch (error) {
    return {
      text: null,
      citations: [],
      error: sanitizeAiError(error, input.context ?? "getOpenAIClient"),
    };
  }

  const model = input.model?.trim() || getOpenAIModel();
  const requestContext = input.context ?? "createWebSearchResponse";
  const started = Date.now();

  try {
    const response = await client.responses.create(
      {
        model,
        store: false,
        prompt_cache_key: OUTREACH_RESEARCH_PROMPT_CACHE_KEY,
        max_output_tokens: 2000,
        ...(input.reasoningEffort
          ? { reasoning: { effort: input.reasoningEffort } }
          : {}),
        tools: [
          {
            type: "web_search",
            search_context_size: "medium",
            user_location: input.userLocation
              ? {
                  type: "approximate",
                  city: input.userLocation.city ?? undefined,
                  region: input.userLocation.region ?? undefined,
                  country: input.userLocation.country ?? undefined,
                  timezone: input.userLocation.timezone ?? undefined,
                }
              : undefined,
          },
        ],
        input: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      },
      { timeout: input.timeoutMs ?? 40_000, maxRetries: 1 },
    );

    const extracted = extractResponsesOutputText(response);
    logOutreachUsage(requestContext, {
      model: response.model || model,
      latencyMs: Date.now() - started,
      status: extracted.status,
      attempt: 1,
      usage: readResponseUsage(response.usage),
    });

    const citations: Array<{ url: string; title: string }> = [];
    for (const item of response.output) {
      if (item.type !== "message") continue;
      for (const content of item.content) {
        if (content.type !== "output_text") continue;
        for (const annotation of content.annotations) {
          if (annotation.type === "url_citation") {
            citations.push({ url: annotation.url, title: annotation.title });
          }
        }
      }
    }

    if (!extracted.text || extracted.status === "failed") {
      return {
        text: null,
        citations,
        error: "Market research returned an empty response.",
      };
    }

    return { text: extracted.text, citations, error: null };
  } catch (error) {
    return {
      text: null,
      citations: [],
      error: sanitizeAiError(error, requestContext, model),
    };
  }
}
