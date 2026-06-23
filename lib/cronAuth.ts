export function getCronSecretConfigError(): string | null {
  if (!process.env.CRON_SECRET?.trim()) {
    return "CRON_SECRET is not configured.";
  }
  return null;
}

export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}
