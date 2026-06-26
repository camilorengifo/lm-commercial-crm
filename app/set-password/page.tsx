import { SetPasswordForm } from "@/components/set-password-form";
import { validateUserInvitation } from "@/lib/userInvitations";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  let validation;
  try {
    validation = await validateUserInvitation(token);
  } catch (error) {
    console.error("[invitation-validate] page error", error);
    validation = {
      valid: false as const,
      reason: "invitation_not_found" as const,
    };
  }

  return <SetPasswordForm token={token} validation={validation} />;
}
