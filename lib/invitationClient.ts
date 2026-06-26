export async function acceptInvitation(input: {
  token: string;
  password: string;
}): Promise<{ data: { message: string; email: string } | null; error: string | null }> {
  const response = await fetch("/api/invitations/accept", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as {
    message?: string;
    email?: string;
    error?: string;
  };

  if (!response.ok) {
    return {
      data: null,
      error: payload.error ?? "Unable to accept invitation.",
    };
  }

  return {
    data: {
      message: payload.message ?? "Password created successfully.",
      email: payload.email ?? "",
    },
    error: null,
  };
}
