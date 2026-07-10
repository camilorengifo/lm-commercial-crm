"use client";

import { FormEvent } from "react";
import { CrmCard, SectionHeader } from "@/components/crm-ui";
import {
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_STATUS_LABELS,
} from "@/lib/carrierConstants";
import type { CarrierListItem } from "@/lib/carrierDirectory";

export interface CarrierRelationshipFormState {
  privateNotes: string;
  isPreferred: boolean;
  relationshipStatus: string;
  lastContactedAt: string;
  preferredContactId: string;
}

export function CarrierDetailRelationshipSection({
  carrier,
  inMyCarriers,
  relationshipForm,
  savingRelationship,
  onRelationshipFormChange,
  onSaveRelationship,
  onAddToMyCarriers,
}: {
  carrier: CarrierListItem;
  inMyCarriers: boolean;
  relationshipForm: CarrierRelationshipFormState;
  savingRelationship: boolean;
  onRelationshipFormChange: (
    updater: (current: CarrierRelationshipFormState) => CarrierRelationshipFormState,
  ) => void;
  onSaveRelationship: (event: FormEvent) => void;
  onAddToMyCarriers: () => void;
}) {
  return (
    <CrmCard>
      <SectionHeader
        title="My Relationship"
        description="Private to you. Only you can edit this section."
        actions={
          !inMyCarriers ? (
            <button
              type="button"
              onClick={onAddToMyCarriers}
              className="crm-btn-primary crm-btn-sm"
            >
              Add to My Carriers
            </button>
          ) : null
        }
      />
      {!inMyCarriers ? (
        <p className="mt-3 text-sm text-slate-500">
          Add this carrier to My Carriers to track private notes and relationship details.
        </p>
      ) : (
        <form onSubmit={onSaveRelationship} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Private notes
            </span>
            <textarea
              className="crm-input min-h-24 w-full"
              value={relationshipForm.privateNotes}
              onChange={(event) =>
                onRelationshipFormChange((current) => ({
                  ...current,
                  privateNotes: event.target.value,
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={relationshipForm.isPreferred}
              onChange={(event) =>
                onRelationshipFormChange((current) => ({
                  ...current,
                  isPreferred: event.target.checked,
                }))
              }
            />
            <span className="text-sm text-slate-700">Preferred carrier</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Relationship status
            </span>
            <select
              className="crm-select w-full max-w-sm"
              value={relationshipForm.relationshipStatus}
              onChange={(event) =>
                onRelationshipFormChange((current) => ({
                  ...current,
                  relationshipStatus: event.target.value,
                }))
              }
            >
              <option value="">—</option>
              {RELATIONSHIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RELATIONSHIP_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Last contacted date
            </span>
            <input
              type="date"
              className="crm-input max-w-sm"
              value={relationshipForm.lastContactedAt}
              onChange={(event) =>
                onRelationshipFormChange((current) => ({
                  ...current,
                  lastContactedAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Preferred contact
            </span>
            <select
              className="crm-select w-full max-w-sm"
              value={relationshipForm.preferredContactId}
              onChange={(event) =>
                onRelationshipFormChange((current) => ({
                  ...current,
                  preferredContactId: event.target.value,
                }))
              }
            >
              <option value="">—</option>
              {carrier.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={savingRelationship}
            className="crm-btn-primary disabled:opacity-60"
          >
            {savingRelationship ? "Saving..." : "Save my relationship"}
          </button>
        </form>
      )}
    </CrmCard>
  );
}
