"use client";

import type { CompanyCreateContactForm } from "@/lib/companyCreateContacts";

export function CompanyCreateContactsSection({
  open,
  onToggle,
  contacts,
  onAddRow,
  onRemoveRow,
  onUpdateField,
}: {
  open: boolean;
  onToggle: () => void;
  contacts: CompanyCreateContactForm[];
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onUpdateField: (
    index: number,
    field: keyof CompanyCreateContactForm,
    value: string,
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-medium text-zinc-900">Contacts (optional)</p>
          <p className="text-xs text-zinc-500">
            Add none, one, or multiple contacts before saving
          </p>
        </div>
        <span className="text-sm text-zinc-500">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-zinc-200 px-4 py-4">
          {contacts.map((contact, index) => (
            <div
              key={`create-contact-${index}`}
              className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Contact {index + 1}
                </p>
                {contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveRow(index)}
                    className="text-xs font-medium text-zinc-500 transition hover:text-zinc-800"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`create-contact-name-${index}`}
                    className="crm-label"
                  >
                    Contact name
                  </label>
                  <input
                    id={`create-contact-name-${index}`}
                    type="text"
                    value={contact.name}
                    onChange={(event) =>
                      onUpdateField(index, "name", event.target.value)
                    }
                    className="crm-input"
                    placeholder="Jane Smith"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`create-contact-role-${index}`}
                    className="crm-label"
                  >
                    Role / Job title
                  </label>
                  <input
                    id={`create-contact-role-${index}`}
                    type="text"
                    value={contact.job_title}
                    onChange={(event) =>
                      onUpdateField(index, "job_title", event.target.value)
                    }
                    className="crm-input"
                    placeholder="Logistics Manager"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`create-contact-email-${index}`}
                    className="crm-label"
                  >
                    Email
                  </label>
                  <input
                    id={`create-contact-email-${index}`}
                    type="email"
                    value={contact.email}
                    onChange={(event) =>
                      onUpdateField(index, "email", event.target.value)
                    }
                    className="crm-input"
                    placeholder="jane@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`create-contact-phone-${index}`}
                    className="crm-label"
                  >
                    Phone
                  </label>
                  <input
                    id={`create-contact-phone-${index}`}
                    type="tel"
                    value={contact.phone}
                    onChange={(event) =>
                      onUpdateField(index, "phone", event.target.value)
                    }
                    className="crm-input"
                    placeholder="+1 555 0100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor={`create-contact-notes-${index}`}
                    className="crm-label"
                  >
                    Notes
                  </label>
                  <textarea
                    id={`create-contact-notes-${index}`}
                    rows={2}
                    value={contact.notes}
                    onChange={(event) =>
                      onUpdateField(index, "notes", event.target.value)
                    }
                    className="crm-input"
                    placeholder="Optional notes about this contact"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={onAddRow}
            className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
          >
            + Add contact
          </button>
        </div>
      )}
    </div>
  );
}
