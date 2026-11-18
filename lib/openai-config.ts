import "server-only";
import { resolveOutreachModel } from "@/lib/outreachModel";

/**
 * Shared OpenAI model for CRM AI features.
 * Override with OPENAI_MODEL in server environment only — never NEXT_PUBLIC.
 * Outreach can use OPENAI_OUTREACH_MODEL when that feature needs its own setting.
 */
export const OPENAI_MODEL =
  process.env.OPENAI_MODEL?.trim() || "gpt-6.1-sol";

/**
 * AI Outreach Assistant model. Override with OPENAI_OUTREACH_MODEL.
 * Server-side only — never NEXT_PUBLIC.
 */
export const OPENAI_OUTREACH_MODEL = resolveOutreachModel(
  process.env.OPENAI_OUTREACH_MODEL,
);
