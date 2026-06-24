import OpenAI from "openai";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";

export { AI_CLIENT_ERROR_MESSAGE };

export class OpenAIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIConfigurationError";
  }
}

export interface OpenAIKeyDiagnostics {
  exists: boolean;
  containsNewline: boolean;
  containsSpace: boolean;
  containsResendLiteral: boolean;
  containsOpenaiLiteral: boolean;
  startsWithSk: boolean;
}

function readRawOpenAIApiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

export function getOpenAIKeyDiagnostics(): OpenAIKeyDiagnostics {
  const raw = readRawOpenAIApiKey();
  const trimmed = raw.trim();

  return {
    exists: trimmed.length > 0,
    containsNewline: /[\r\n]/.test(raw),
    containsSpace: /\s/.test(trimmed),
    containsResendLiteral: trimmed.includes("RESEND_API_KEY"),
    containsOpenaiLiteral: trimmed.includes("OPENAI_API_KEY="),
    startsWithSk: trimmed.startsWith("sk-"),
  };
}

export function logOpenAIKeyDiagnostics(context?: string): void {
  const diagnostics = getOpenAIKeyDiagnostics();

  console.error(
    `[openai] API key diagnostics${context ? ` (${context})` : ""}:`,
    {
      exists: diagnostics.exists,
      startsWithSk: diagnostics.startsWithSk,
      containsResendLiteral: diagnostics.containsResendLiteral,
      containsOpenaiLiteral: diagnostics.containsOpenaiLiteral,
      containsNewline: diagnostics.containsNewline,
      containsSpace: diagnostics.containsSpace,
    },
  );
}

export function getOpenAIKey(): string {
  const raw = readRawOpenAIApiKey();
  const trimmed = raw.trim();
  const diagnostics = getOpenAIKeyDiagnostics();

  if (!trimmed) {
    logOpenAIKeyDiagnostics("missing");
    throw new OpenAIConfigurationError("OPENAI_API_KEY is missing.");
  }

  if (diagnostics.containsNewline) {
    logOpenAIKeyDiagnostics("contains_newline");
    throw new OpenAIConfigurationError("OPENAI_API_KEY is invalid.");
  }

  if (diagnostics.containsSpace) {
    logOpenAIKeyDiagnostics("contains_space");
    throw new OpenAIConfigurationError("OPENAI_API_KEY is invalid.");
  }

  if (diagnostics.containsResendLiteral) {
    logOpenAIKeyDiagnostics("contains_resend_literal");
    throw new OpenAIConfigurationError("OPENAI_API_KEY is invalid.");
  }

  if (diagnostics.containsOpenaiLiteral) {
    logOpenAIKeyDiagnostics("contains_openai_literal");
    throw new OpenAIConfigurationError("OPENAI_API_KEY is invalid.");
  }

  if (!diagnostics.startsWithSk) {
    logOpenAIKeyDiagnostics("invalid_prefix");
    throw new OpenAIConfigurationError("OPENAI_API_KEY is invalid.");
  }

  return trimmed;
}

export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: getOpenAIKey() });
}

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function getOpenAIModel(): string {
  const configured = process.env.OPENAI_MODEL?.trim();
  return configured || DEFAULT_OPENAI_MODEL;
}

function redactSecrets(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[REDACTED_RESEND_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/OPENAI_API_KEY=\S+/gi, "OPENAI_API_KEY=[REDACTED]")
    .replace(/RESEND_API_KEY=\S+/gi, "RESEND_API_KEY=[REDACTED]");
}

export function sanitizeAiError(error: unknown, context?: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown_error";

  console.error(
    `[openai] AI request failed${context ? ` (${context})` : ""}:`,
    redactSecrets(message),
  );

  return AI_CLIENT_ERROR_MESSAGE;
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
    sanitizeAiError(error, input.context ?? "getOpenAIClient");
    return { data: null, error: AI_CLIENT_ERROR_MESSAGE };
  }

  const model = input.model ?? getOpenAIModel();

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return {
        data: null,
        error: AI_CLIENT_ERROR_MESSAGE,
      };
    }

    return { data: JSON.parse(content) as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: sanitizeAiError(error, input.context ?? "generateJsonCompletion"),
    };
  }
}
