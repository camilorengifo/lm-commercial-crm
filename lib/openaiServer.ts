import OpenAI from "openai";
import {
  AI_CLIENT_ERROR_MESSAGE,
  createAiErrorRef,
  formatAiClientError,
} from "@/lib/aiConstants";
import { OPENAI_MODEL } from "@/lib/openai-config";

export { AI_CLIENT_ERROR_MESSAGE };
export { OPENAI_MODEL };

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

function redactSecrets(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[REDACTED_RESEND_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/OPENAI_API_KEY=\S+/gi, "OPENAI_API_KEY=[REDACTED]")
    .replace(/RESEND_API_KEY=\S+/gi, "RESEND_API_KEY=[REDACTED]");
}

/**
 * GPT-5 / o-series reasoning models only accept the default temperature (1).
 * Custom values like 0.3 cause HTTP 400 unsupported_value.
 * gpt-4o-mini and similar chat models still support custom temperature.
 */
export function modelSupportsCustomTemperature(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return true;

  if (
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return false;
  }

  return true;
}

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
