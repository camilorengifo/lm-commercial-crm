import OpenAI from "openai";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";

export { AI_CLIENT_ERROR_MESSAGE };

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
