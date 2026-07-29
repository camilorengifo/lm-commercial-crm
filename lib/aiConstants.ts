export const AI_CLIENT_ERROR_MESSAGE =
  "AI generation failed. Please try again. If the issue continues, contact an administrator.";

export function createAiErrorRef(): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AI-${time}-${rand}`;
}

export function formatAiClientError(ref: string): string {
  return `AI generation failed. Please try again. (Ref: ${ref})`;
}

export function sanitizeClientAiError(
  error: string | null | undefined,
  status = 500,
): string {
  if (!error) {
    return AI_CLIENT_ERROR_MESSAGE;
  }

  if (
    error === "Unauthorized" ||
    error === "You must be signed in to use AI features." ||
    error === "Company not found." ||
    error === "Company ID is required." ||
    error === "Invalid request body." ||
    error.startsWith("A valid ")
  ) {
    return error;
  }

  // Allow our own user-facing generation errors (including Ref codes) through.
  if (error.startsWith("AI generation failed.")) {
    return error;
  }

  if (
    /sk-[A-Za-z0-9_-]+/.test(error) ||
    /re_[A-Za-z0-9_-]+/.test(error) ||
    /Bearer\s+/i.test(error) ||
    error.includes("OPENAI_API_KEY=") ||
    error.includes("RESEND_API_KEY=") ||
    error.includes("Headers.append")
  ) {
    return AI_CLIENT_ERROR_MESSAGE;
  }

  if (status >= 500) {
    return AI_CLIENT_ERROR_MESSAGE;
  }

  return AI_CLIENT_ERROR_MESSAGE;
}
