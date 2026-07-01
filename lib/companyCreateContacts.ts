export interface CompanyCreateContactForm {
  name: string;
  job_title: string;
  email: string;
  phone: string;
  notes: string;
}

export const EMPTY_COMPANY_CREATE_CONTACT: CompanyCreateContactForm = {
  name: "",
  job_title: "",
  email: "",
  phone: "",
  notes: "",
};

export function isContactEmpty(contact: CompanyCreateContactForm): boolean {
  return (
    !contact.name.trim() &&
    !contact.job_title.trim() &&
    !contact.email.trim() &&
    !contact.phone.trim() &&
    !contact.notes.trim()
  );
}

export function filterNonEmptyContacts(
  contacts: CompanyCreateContactForm[],
): CompanyCreateContactForm[] {
  return contacts.filter((contact) => !isContactEmpty(contact));
}

export function parseContactName(name: string): {
  first_name: string;
  last_name: string | null;
} {
  const trimmed = name.trim();

  if (!trimmed) {
    return { first_name: "Contact", last_name: null };
  }

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { first_name: trimmed, last_name: null };
  }

  return {
    first_name: trimmed.slice(0, spaceIndex),
    last_name: trimmed.slice(spaceIndex + 1).trim() || null,
  };
}

export function buildContactInsertPayload(
  contact: CompanyCreateContactForm,
  input: {
    userId: string;
    companyId: string;
    isPrimary: boolean;
  },
) {
  const { first_name, last_name } = parseContactName(contact.name);

  return {
    user_id: input.userId,
    company_id: input.companyId,
    first_name,
    last_name,
    job_title: contact.job_title.trim() || null,
    email: contact.email.trim() || null,
    phone: contact.phone.trim() || null,
    notes: contact.notes.trim() || null,
    is_primary: input.isPrimary,
  };
}

export function createCompanySuccessMessage(contactCount: number): string {
  if (contactCount > 0) {
    return "Company and contacts created successfully.";
  }

  return "Company created successfully.";
}

export function createCompanyContactsWarningMessage(): string {
  return "Company was created, but one or more contacts could not be saved. You can add them from the Contacts section below.";
}
