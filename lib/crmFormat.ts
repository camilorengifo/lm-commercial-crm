export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSupabaseError(error: { message?: string }): string {
  const message = error.message ?? "";

  if (message === "Failed to fetch" || message.toLowerCase().includes("network")) {
    return "Unable to connect. Check your internet connection and try again.";
  }

  if (message.includes("duplicate") || message.includes("unique")) {
    return "A company with this name may already exist.";
  }

  return message || "Something went wrong. Please try again.";
}
