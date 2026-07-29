import "server-only";

/**
 * Central OpenAI model for all CRM AI features.
 * Override with OPENAI_MODEL in server environment only — never NEXT_PUBLIC.
 */
export const OPENAI_MODEL =
  process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra";
