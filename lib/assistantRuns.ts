import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantGenerateResponse } from "@/lib/aiPrompts";

export async function saveAssistantRun(
  supabase: SupabaseClient,
  input: {
    userId: string;
    inputSummary: string;
    outputText: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ai_broker_assistant_runs").insert({
    user_id: input.userId,
    input_summary: input.inputSummary,
    output_text: input.outputText,
  });

  if (error) {
    console.error("[assistant] Failed to save run history:", error.message);
  }
}

export function formatAssistantRunOutput(result: AssistantGenerateResponse): string {
  const sections = [
    result.actionPlan,
    result.whatToDoFirst.length > 0
      ? `What to do first:\n${result.whatToDoFirst.map((item) => `- ${item}`).join("\n")}`
      : "",
    result.commercialFocus.length > 0
      ? `Commercial focus:\n${result.commercialFocus.map((item) => `- ${item}`).join("\n")}`
      : "",
    result.risks.length > 0
      ? `Risks:\n${result.risks.map((item) => `- ${item}`).join("\n")}`
      : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}
