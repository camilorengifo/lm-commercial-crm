import { DEFAULT_SALES_STAGE, type CompanyPriority, type SalesStage } from "@/lib/crmConstants";
import {
  EMPTY_COMPANY_CREATE_CONTACT,
  isContactEmpty,
  type CompanyCreateContactForm,
} from "@/lib/companyCreateContacts";

export const ADD_COMPANY_DRAFT_VERSION = 1;

export interface AddCompanyFormState {
  name: string;
  city: string;
  state: string;
  country: string;
  priority: CompanyPriority;
  sales_stage: SalesStage;
  general_notes: string;
  last_contact_at: string;
}

export interface AddCompanyDraftData {
  form: AddCompanyFormState;
  contactRows: CompanyCreateContactForm[];
  contactsSectionOpen: boolean;
}

export interface AddCompanyDraft {
  version: number;
  savedAt: string;
  data: AddCompanyDraftData;
}

export const EMPTY_ADD_COMPANY_FORM: AddCompanyFormState = {
  name: "",
  city: "",
  state: "",
  country: "United States",
  priority: "Medium",
  sales_stage: DEFAULT_SALES_STAGE,
  general_notes: "",
  last_contact_at: "",
};

export function getAddCompanyDraftKey(userId: string): string {
  return `crm:add-company-draft:${userId}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isAddCompanyFormEmpty(
  form: AddCompanyFormState,
  contactRows: CompanyCreateContactForm[],
): boolean {
  const formMatchesEmpty =
    form.name.trim() === "" &&
    form.city.trim() === "" &&
    form.state.trim() === "" &&
    form.country === EMPTY_ADD_COMPANY_FORM.country &&
    form.priority === EMPTY_ADD_COMPANY_FORM.priority &&
    form.sales_stage === EMPTY_ADD_COMPANY_FORM.sales_stage &&
    form.general_notes.trim() === "" &&
    form.last_contact_at.trim() === "";

  const contactsEmpty =
    contactRows.length === 0 ||
    contactRows.every((contact) => isContactEmpty(contact));

  return formMatchesEmpty && contactsEmpty;
}

export function saveAddCompanyDraft(
  userId: string,
  data: AddCompanyDraftData,
): AddCompanyDraft | null {
  if (!isBrowser()) {
    return null;
  }

  const draft: AddCompanyDraft = {
    version: ADD_COMPANY_DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    data: {
      form: { ...data.form },
      contactRows: data.contactRows.map((contact) => ({ ...contact })),
      contactsSectionOpen: data.contactsSectionOpen,
    },
  };

  try {
    localStorage.setItem(getAddCompanyDraftKey(userId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

function normalizeDraftForm(form: Partial<AddCompanyFormState>): AddCompanyFormState {
  return {
    name: typeof form.name === "string" ? form.name : "",
    city: typeof form.city === "string" ? form.city : "",
    state: typeof form.state === "string" ? form.state : "",
    country:
      typeof form.country === "string" && form.country.trim()
        ? form.country
        : EMPTY_ADD_COMPANY_FORM.country,
    priority:
      typeof form.priority === "string"
        ? (form.priority as CompanyPriority)
        : EMPTY_ADD_COMPANY_FORM.priority,
    sales_stage:
      typeof form.sales_stage === "string"
        ? (form.sales_stage as SalesStage)
        : EMPTY_ADD_COMPANY_FORM.sales_stage,
    general_notes:
      typeof form.general_notes === "string" ? form.general_notes : "",
    last_contact_at:
      typeof form.last_contact_at === "string" ? form.last_contact_at : "",
  };
}

function normalizeContactRows(
  value: unknown,
): CompanyCreateContactForm[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ ...EMPTY_COMPANY_CREATE_CONTACT }];
  }

  return value.map((row) => {
    const contact = row as Partial<CompanyCreateContactForm>;
    return {
      name: typeof contact.name === "string" ? contact.name : "",
      job_title: typeof contact.job_title === "string" ? contact.job_title : "",
      email: typeof contact.email === "string" ? contact.email : "",
      phone: typeof contact.phone === "string" ? contact.phone : "",
      notes: typeof contact.notes === "string" ? contact.notes : "",
    };
  });
}

export function loadAddCompanyDraft(userId: string): AddCompanyDraft | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(getAddCompanyDraftKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AddCompanyDraft>;
    if (parsed.version !== ADD_COMPANY_DRAFT_VERSION || !parsed.data) {
      return null;
    }

    const data = parsed.data as Partial<AddCompanyDraftData>;

    return {
      version: ADD_COMPANY_DRAFT_VERSION,
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date().toISOString(),
      data: {
        form: normalizeDraftForm(data.form ?? {}),
        contactRows: normalizeContactRows(data.contactRows),
        contactsSectionOpen: data.contactsSectionOpen === true,
      },
    };
  } catch {
    return null;
  }
}

export function clearAddCompanyDraft(userId: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.removeItem(getAddCompanyDraftKey(userId));
  } catch {
    // Ignore storage errors.
  }
}

export function formatDraftSavedTime(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
