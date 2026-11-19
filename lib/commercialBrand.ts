/**
 * Customer-facing brokerage name for the commercial assistant.
 * The CRM product name stays separate. Timeline notes are not rewritten here.
 */

export const COMMERCIAL_COMPANY_NAME = "Armstrong Transport Group";

const LEGACY_PRODUCT_NAME = /logistics masters ai commercial assistant/gi;
const LEGACY_COMPANY_NAME = /logistics masters/gi;

export function commercialDirectorIntro(): string {
  return `You are a senior Business Development Director at ${COMMERCIAL_COMPANY_NAME}, a United States freight brokerage. You advise one broker inside the Logistics Masters AI Commercial Assistant.`;
}

export function commercialBrandInstruction(): string {
  return [
    `Our commercial name is "${COMMERCIAL_COMPANY_NAME}".`,
    "When the subject, any subject alternative, the body, or the signature mentions our company, use that exact name in every email type, tone, and language. Do not translate it, shorten it, or replace it with a former name.",
    "Naming the company is optional. Leave it out when the sentence is more natural without it.",
    `CRM notes, older drafts, and the product name "Logistics Masters AI Commercial Assistant" may say "Logistics Masters". That historical or product label does not override "${COMMERCIAL_COMPANY_NAME}" in text the customer would read.`,
    `Do not write "Logistics Masters" in the subject, the alternatives, the body, the signature, or the copyable draft.`,
    "Do not change the configured sender email, and do not rename the customer.",
  ].join(" ");
}

export function applyCommercialBrand(text: string): string {
  return text
    .replace(LEGACY_PRODUCT_NAME, COMMERCIAL_COMPANY_NAME)
    .replace(LEGACY_COMPANY_NAME, COMMERCIAL_COMPANY_NAME);
}

export interface CommercialBrandDraft {
  subjectLine: string | null;
  subjectAlternatives: string[];
  commercialSummary: string | null;
  marketInsight: string | null;
  commercialRecommendation: string | null;
  suggestedNextStep: string | null;
  emailDraft: string | null;
  sections: Array<{ title: string; content: string }>;
  fullDraft: string;
}

function brandNullable(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return applyCommercialBrand(value);
}

export function applyCommercialBrandToDraft<T extends CommercialBrandDraft>(draft: T): T {
  const originalSubjects = draft.subjectAlternatives ?? [];
  const originalSections = draft.sections ?? [];
  const subjectLine = brandNullable(draft.subjectLine);
  const subjectAlternatives = originalSubjects.map((subject) => applyCommercialBrand(subject));
  const commercialSummary = brandNullable(draft.commercialSummary);
  const marketInsight = brandNullable(draft.marketInsight);
  const commercialRecommendation = brandNullable(draft.commercialRecommendation);
  const suggestedNextStep = brandNullable(draft.suggestedNextStep);
  const emailDraft = brandNullable(draft.emailDraft);
  const sections = originalSections.map((section) => ({
    title: applyCommercialBrand(section.title),
    content: applyCommercialBrand(section.content),
  }));
  const fullDraft = applyCommercialBrand(draft.fullDraft ?? "");

  const subjectsUnchanged =
    subjectAlternatives.length === originalSubjects.length &&
    subjectAlternatives.every((subject, index) => subject === originalSubjects[index]);
  const sectionsUnchanged =
    sections.length === originalSections.length &&
    sections.every(
      (section, index) =>
        section.title === originalSections[index]?.title &&
        section.content === originalSections[index]?.content,
    );

  if (
    subjectLine === draft.subjectLine &&
    subjectsUnchanged &&
    commercialSummary === draft.commercialSummary &&
    marketInsight === draft.marketInsight &&
    commercialRecommendation === draft.commercialRecommendation &&
    suggestedNextStep === draft.suggestedNextStep &&
    emailDraft === draft.emailDraft &&
    sectionsUnchanged &&
    fullDraft === draft.fullDraft
  ) {
    return draft;
  }

  return {
    ...draft,
    subjectLine,
    subjectAlternatives,
    commercialSummary,
    marketInsight,
    commercialRecommendation,
    suggestedNextStep,
    emailDraft,
    sections,
    fullDraft,
  };
}

export interface OutreachSenderFields {
  draft: CommercialBrandDraft | null;
  editedFullDraft?: string;
  editedSubjects?: string[];
  editedSummary?: string;
  editedMarketInsight?: string;
  editedRecommendation?: string;
  editedEmail?: string;
  editedNextStep?: string;
}

export function correctOutreachSenderContent<T extends OutreachSenderFields>(state: T): T {
  const editedFullDraft = applyCommercialBrand(state.editedFullDraft ?? "");
  const editedSubjects = (state.editedSubjects ?? []).map((subject) =>
    applyCommercialBrand(subject),
  );
  const editedSummary = applyCommercialBrand(state.editedSummary ?? "");
  const editedMarketInsight = applyCommercialBrand(state.editedMarketInsight ?? "");
  const editedRecommendation = applyCommercialBrand(state.editedRecommendation ?? "");
  const editedEmail = applyCommercialBrand(state.editedEmail ?? "");
  const editedNextStep = applyCommercialBrand(state.editedNextStep ?? "");
  const draft = state.draft ? applyCommercialBrandToDraft(state.draft) : state.draft;

  const subjectsUnchanged =
    editedSubjects.length === (state.editedSubjects ?? []).length &&
    editedSubjects.every(
      (subject, index) => subject === (state.editedSubjects ?? [])[index],
    );

  if (
    editedFullDraft === (state.editedFullDraft ?? "") &&
    subjectsUnchanged &&
    editedSummary === (state.editedSummary ?? "") &&
    editedMarketInsight === (state.editedMarketInsight ?? "") &&
    editedRecommendation === (state.editedRecommendation ?? "") &&
    editedEmail === (state.editedEmail ?? "") &&
    editedNextStep === (state.editedNextStep ?? "") &&
    draft === state.draft
  ) {
    return state;
  }

  return {
    ...state,
    draft,
    editedFullDraft,
    editedSubjects,
    editedSummary,
    editedMarketInsight,
    editedRecommendation,
    editedEmail,
    editedNextStep,
  };
}
