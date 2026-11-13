import "server-only";
import { resolveOutreachModel } from "@/lib/outreachModel";

/**
 * Shared OpenAI model for CRM AI features other than the Outreach Assistant.
 * Override with OPENAI_MODEL in server environment only — never NEXT_PUBLIC.
 */
export const OPENAI_MODEL =
  process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra";

/**
 * AI Outreach Assistant model. Override with OPENAI_OUTREACH_MODEL.
 * Server-side only — never NEXT_PUBLIC.
 */
export const OPENAI_OUTREACH_MODEL = resolveOutreachModel(
  process.env.OPENAI_OUTREACH_MODEL,
);
