"use client";

import {
  LOAD_OPPORTUNITY_STATUSES,
  getOpportunityStageLabel,
  type LoadOpportunityStatus,
} from "@/lib/crmConstants";
import {
  type ContactOption,
  type OpportunityFormState,
  formatContactName,
} from "@/lib/loadOpportunities";

export function LoadOpportunityFormFields({
  form,
  setForm,
  contacts,
  idPrefix,
}: {
  form: OpportunityFormState;
  setForm: React.Dispatch<React.SetStateAction<OpportunityFormState>>;
  contacts: ContactOption[];
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-name`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Opportunity name <span className="text-red-600">*</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          required
          value={form.name}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, name: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="e.g. Chicago-Dallas produce reefer..."
        />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-contact_id`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Contact
        </label>
        <select
          id={`${idPrefix}-contact_id`}
          value={form.contact_id}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, contact_id: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          <option value="">No specific contact</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {formatContactName(contact)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-lane_origin`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Origin
        </label>
        <input
          id={`${idPrefix}-lane_origin`}
          type="text"
          value={form.lane_origin}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, lane_origin: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Chicago, IL"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-lane_destination`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Destination
        </label>
        <input
          id={`${idPrefix}-lane_destination`}
          type="text"
          value={form.lane_destination}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              lane_destination: event.target.value,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Dallas, TX"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-equipment_type`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Equipment type
        </label>
        <input
          id={`${idPrefix}-equipment_type`}
          type="text"
          value={form.equipment_type}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, equipment_type: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Dry van, reefer, flatbed..."
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-commodity`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Commodity
        </label>
        <input
          id={`${idPrefix}-commodity`}
          type="text"
          value={form.commodity}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, commodity: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="General freight, produce..."
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-status`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Stage <span className="text-red-600">*</span>
        </label>
        <select
          id={`${idPrefix}-status`}
          required
          value={form.status}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              status: event.target.value as LoadOpportunityStatus,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          {LOAD_OPPORTUNITY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getOpportunityStageLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-notes`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={form.notes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, notes: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Volume expectations, seasonality, special requirements..."
        />
      </div>
    </div>
  );
}
