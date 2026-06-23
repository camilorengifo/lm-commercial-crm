export const AI_CLIENT_ERROR_MESSAGE =
  "AI generation failed. Please try again. If the issue continues, contact an administrator.";

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
