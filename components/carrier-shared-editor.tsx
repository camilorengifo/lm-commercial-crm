"use client";

import { FormEvent, useEffect, useState } from "react";
import { CrmCard, SectionHeader } from "@/components/crm-ui";
import { updateCarrierShared } from "@/lib/carrierClient";
import {
  CARRIER_STATUSES,
  CARRIER_STATUS_LABELS,
  formatCarrierStatus,
  formatEquipmentType,
  formatServiceType,
} from "@/lib/carrierConstants";
import type { CarrierListItem } from "@/lib/carrierDirectory";
import { carrierToForm } from "@/lib/carrierForm";
import type { CarrierFormInput } from "@/lib/carrierValidation";
import { EMPTY_CARRIER_FORM } from "@/lib/carrierValidation";

export function CarrierSharedEditor({
  carrier,
  startInEditMode = false,
  onUpdated,
  onSuccess,
  onError,
}: {
  carrier: CarrierListItem;
  startInEditMode?: boolean;
  onUpdated: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [editingShared, setEditingShared] = useState(startInEditMode);
  const [sharedForm, setSharedForm] = useState<CarrierFormInput>(EMPTY_CARRIER_FORM);
  const [savingShared, setSavingShared] = useState(false);

  useEffect(() => {
    setSharedForm(carrierToForm(carrier));
  }, [carrier]);

  useEffect(() => {
    setEditingShared(startInEditMode);
  }, [startInEditMode, carrier.id]);

  async function handleSaveShared(event: FormEvent) {
    event.preventDefault();
    setSavingShared(true);
    const { error } = await updateCarrierShared({
      carrierId: carrier.id,
      form: sharedForm,
      editContext: "network",
    });
    setSavingShared(false);

    if (error) {
      onError(error);
      return;
    }

    onSuccess("Shared carrier information updated.");
    setEditingShared(false);
    await onUpdated();
  }

  return (
    <CrmCard>
      <SectionHeader
        title="Edit Shared Carrier"
        actions={
          <button
            type="button"
            onClick={() => setEditingShared((current) => !current)}
            className="crm-btn-secondary crm-btn-sm"
          >
            {editingShared ? "Cancel edit" : "Edit"}
          </button>
        }
      />
      {editingShared ? (
        <form onSubmit={handleSaveShared} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Legal Carrier Name
              </span>
              <input
                className="crm-input w-full"
                value={sharedForm.legalName}
                onChange={(event) =>
                  setSharedForm((current) => ({
                    ...current,
                    legalName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Status
              </span>
              <select
                className="crm-select w-full"
                value={sharedForm.status}
                onChange={(event) =>
                  setSharedForm((current) => ({
                    ...current,
                    status: event.target.value as CarrierFormInput["status"],
                  }))
                }
              >
                {CARRIER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CARRIER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-7">
              <input
                type="checkbox"
                checked={sharedForm.isBonded}
                onChange={(event) =>
                  setSharedForm((current) => ({
                    ...current,
                    isBonded: event.target.checked,
                  }))
                }
              />
              <span className="text-sm text-slate-700">Bonded</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sharedForm.isHazmat}
                onChange={(event) =>
                  setSharedForm((current) => ({
                    ...current,
                    isHazmat: event.target.checked,
                  }))
                }
              />
              <span className="text-sm text-slate-700">Hazmat</span>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Saving updates shared services, equipment, areas, and contacts from the
            current carrier snapshot.
          </p>
          <button
            type="submit"
            disabled={savingShared}
            className="crm-btn-primary disabled:opacity-60"
          >
            {savingShared ? "Saving..." : "Save shared carrier"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Status: {formatCarrierStatus(carrier.status)} · Services:{" "}
          {carrier.services.map(formatServiceType).join(", ") || "—"} · Equipment:{" "}
          {carrier.equipment.map(formatEquipmentType).join(", ") || "—"}
        </p>
      )}
    </CrmCard>
  );
}
