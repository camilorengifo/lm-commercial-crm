export const OUTREACH_TONES = [
  "Professional",
  "Friendly",
  "Direct",
  "Warm",
  "Persistent but respectful",
  "Conversational",
] as const;

export type OutreachTone = (typeof OUTREACH_TONES)[number];

/**
 * "Natural" is not a current tone. Older saved drafts that used it, or the
 * combined label, resolve to Conversational so the selector stays valid.
 */
const LEGACY_CONVERSATIONAL = new Set(["natural", "conversational / natural", "conversational"]);

export type OutreachVoice =
  | "conversational"
  | "professional"
  | "friendly"
  | "direct"
  | "warm"
  | "persistent";

export function resolveOutreachTone(value: string | null | undefined): OutreachTone | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if ((OUTREACH_TONES as readonly string[]).includes(trimmed)) {
    return trimmed as OutreachTone;
  }
  const folded = trimmed.toLowerCase();
  if (LEGACY_CONVERSATIONAL.has(folded)) return "Conversational";
  return OUTREACH_TONES.find((tone) => tone.toLowerCase() === folded) ?? null;
}

export function outreachVoice(tone: string | null | undefined): OutreachVoice {
  if (!tone?.trim()) return "conversational";
  switch (resolveOutreachTone(tone)) {
    case "Conversational":
      return "conversational";
    case "Direct":
      return "direct";
    case "Friendly":
      return "friendly";
    case "Warm":
      return "warm";
    case "Persistent but respectful":
      return "persistent";
    case "Professional":
      return "professional";
    default:
      return "professional";
  }
}

export function outreachToneInstructions(tone: string, outreachType?: string): string {
  const resolved = resolveOutreachTone(tone) ?? "Professional";
  if (outreachType === "Call Script") {
    return `Selected tone: ${resolved}.
Keep the script short enough to say on a live call, and let this tone decide the wording.
Conversational sounds like the broker talking right after a recent contact.
Direct reaches the ask quickly. Friendly and Warm may leave a little more room for the conversation.
Persistent but respectful stays clear without pressure. Professional is warm and specific.
Do not turn the script into a long email.`;
  }

  if (resolved === "Conversational") {
    return `Selected tone: Conversational.
Write the email the broker would send personally right after the contact.
The body is two or three sentences: everyday professional language, a sense of closeness, and a simple close.
Do not develop a multi-paragraph proposal in this tone.`;
  }

  const personality: Record<Exclude<OutreachTone, "Conversational">, string> = {
    Professional:
      "Professional: warm, complete, and polished. Reach the useful idea without stiffness.",
    Direct:
      "Direct: reach the proposal in the first paragraph after the opening. Spend little time on preamble.",
    Friendly:
      "Friendly: relational and approachable. Give the conversation a little room, then one clear invitation.",
    Warm:
      "Warm: relational. Give the conversation more room than a direct note, then one clear invitation.",
    "Persistent but respectful":
      "Persistent but respectful: make the follow-through clear without pressure or a second ask.",
  };

  return `Selected tone: ${resolved}.
Write a fuller email than a two-sentence note. Two or three short paragraphs are enough.
Use the recorded context to explain why the broker is writing, develop one useful idea for this customer, and close with one concrete invitation that is easy to answer.
${personality[resolved]}
Do not pad the email with repeated courtesies or empty corporate phrases.
Do not shorten this tone to two or three sentences. That length is reserved for Conversational.`;
}
