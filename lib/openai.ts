import OpenAI from "openai";

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function getMissingOpenAIKeyMessage(): string {
  return "AI recommendations are not configured. Set OPENAI_API_KEY in your environment.";
}

export async function generateJsonCompletion<T>(input: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): Promise<{ data: T | null; error: string | null }> {
  const client = getOpenAIClient();
  if (!client) {
    return { data: null, error: getMissingOpenAIKeyMessage() };
  }

  try {
    const response = await client.chat.completions.create({
      model: input.model ?? "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return {
        data: null,
        error: "AI returned an empty response. Please try again.",
      };
    }

    return { data: JSON.parse(content) as T, error: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI generation failed. Please try again.";

    return { data: null, error: message };
  }
}
