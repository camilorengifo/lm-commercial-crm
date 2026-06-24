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
          htmlFor={`${idPrefix}-estimated_loads`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Estimated loads
        </label>
        <input
          id={`${idPrefix}-estimated_loads`}
          type="text"
          value={form.estimated_loads}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              estimated_loads: event.target.value,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="5/week, 20/month, spot..."
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-estimated_loads_per_week`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Loads per week (number)
        </label>
        <input
          id={`${idPrefix}-estimated_loads_per_week`}
          type="number"
          min="0"
          step="1"
          value={form.estimated_loads_per_week}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              estimated_loads_per_week: event.target.value,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-target_rate`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Target rate (USD)
        </label>
        <input
          id={`${idPrefix}-target_rate`}
          type="number"
          min="0"
          step="0.01"
          value={form.target_rate}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, target_rate: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-quoted_rate`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Quoted rate (USD)
        </label>
        <input
          id={`${idPrefix}-quoted_rate`}
          type="number"
          min="0"
          step="0.01"
          value={form.quoted_rate}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, quoted_rate: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-estimated_revenue_usd`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Estimated revenue (USD)
        </label>
        <input
          id={`${idPrefix}-estimated_revenue_usd`}
          type="number"
          min="0"
          step="0.01"
          value={form.estimated_revenue_usd}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              estimated_revenue_usd: event.target.value,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-estimated_margin_usd`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Estimated margin (USD)
        </label>
        <input
          id={`${idPrefix}-estimated_margin_usd`}
          type="number"
          min="0"
          step="0.01"
          value={form.estimated_margin_usd}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              estimated_margin_usd: event.target.value,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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

      <div>
        <label
          htmlFor={`${idPrefix}-probability`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Probability (%)
        </label>
        <input
          id={`${idPrefix}-probability`}
          type="number"
          min="0"
          max="100"
          step="1"
          value={form.probability}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, probability: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-expected_close_date`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Expected close date
        </label>
        <input
          id={`${idPrefix}-expected_close_date`}
          type="date"
          value={form.expected_close_date}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              expected_close_date: event.target.value,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-next_step`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Next step
        </label>
        <input
          id={`${idPrefix}-next_step`}
          type="text"
          value={form.next_step}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, next_step: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Send quote, call shipper..."
        />
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
