import OpenAI from "openai";

export const AI_CLIENT_ERROR_MESSAGE =
  "AI generation failed. Please try again. If the issue continues, contact an administrator.";

export interface OpenAIKeyDiagnostics {
  exists: boolean;
  containsNewline: boolean;
  containsResendLiteral: boolean;
  containsOpenaiLiteral: boolean;
  startsWithSk: boolean;
}

export interface OpenAIKeyValidation {
  valid: boolean;
  reason: string | null;
  diagnostics: OpenAIKeyDiagnostics;
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
    containsResendLiteral: trimmed.includes("RESEND_API_KEY"),
    containsOpenaiLiteral: trimmed.includes("OPENAI_API_KEY="),
    startsWithSk: trimmed.startsWith("sk-"),
  };
}

export function logOpenAIKeyDiagnostics(context?: string): void {
  const diagnostics = getOpenAIKeyDiagnostics();

  console.error(
    `[openai] API key diagnostics${context ? ` (${context})` : ""}:`,
    diagnostics,
  );
}

export function validateOpenAIApiKey(): OpenAIKeyValidation {
  const raw = readRawOpenAIApiKey();
  const trimmed = raw.trim();
  const diagnostics = getOpenAIKeyDiagnostics();

  if (!trimmed) {
    return { valid: false, reason: "missing", diagnostics };
  }

  if (diagnostics.containsNewline) {
    return { valid: false, reason: "contains_newline", diagnostics };
  }

  if (diagnostics.containsResendLiteral) {
    return { valid: false, reason: "contains_resend_literal", diagnostics };
  }

  if (diagnostics.containsOpenaiLiteral) {
    return { valid: false, reason: "contains_openai_literal", diagnostics };
  }

  if (!diagnostics.startsWithSk) {
    return { valid: false, reason: "invalid_prefix", diagnostics };
  }

  return { valid: true, reason: null, diagnostics };
}

export function getValidatedOpenAIApiKey(): string | null {
  const validation = validateOpenAIApiKey();

  if (!validation.valid) {
    logOpenAIKeyDiagnostics(validation.reason ?? "invalid");
    return null;
  }

  return readRawOpenAIApiKey().trim();
}

export function getOpenAIClient(): OpenAI | null {
  const apiKey = getValidatedOpenAIApiKey();
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

export function getMissingOpenAIKeyMessage(): string {
  return "OPENAI_API_KEY is missing or invalid.";
}

function redactSecrets(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[REDACTED_RESEND_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/OPENAI_API_KEY=\S+/gi, "OPENAI_API_KEY=[REDACTED]")
    .replace(/RESEND_API_KEY=\S+/gi, "RESEND_API_KEY=[REDACTED]");
}

function looksLikeSecret(value: string): boolean {
  return (
    /sk-[A-Za-z0-9_-]+/.test(value) ||
    /re_[A-Za-z0-9_-]+/.test(value) ||
    /Bearer\s+/i.test(value) ||
    value.includes("OPENAI_API_KEY=") ||
    value.includes("RESEND_API_KEY=") ||
    value.includes("Headers.append")
  );
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

  if (looksLikeSecret(message)) {
    logOpenAIKeyDiagnostics("sanitized_client_error");
  }

  return AI_CLIENT_ERROR_MESSAGE;
}

export async function generateJsonCompletion<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): Promise<{ data: T | null; error: string | null }> {
  const client = getOpenAIClient();
  if (!client) {
    return { data: null, error: AI_CLIENT_ERROR_MESSAGE };
  }

  try {
    const response = await client.chat.completions.create({
      model: input.model ?? "gpt-4o-mini",
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
    return { data: null, error: sanitizeAiError(error, "generateJsonCompletion") };
  }
}
