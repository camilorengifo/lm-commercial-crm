"use client";

import { FormEvent, useEffect, useState } from "react";
import { CarrierCountrySelect } from "@/components/carrier-country-select";
import type { CarrierEditContext } from "@/lib/carrierEditContext";
import type { CarrierServiceAreaRow } from "@/lib/carrierDirectory";
import {
  addCarrierServiceAreaClient,
  removeCarrierServiceAreaClient,
  updateCarrierServiceAreaClient,
} from "@/lib/carrierClient";
import {
  EMPTY_SERVICE_AREA_INPUT,
  formatServiceAreaLabel,
  serviceAreaRowToInput,
  type ServiceAreaInput,
} from "@/lib/carrierServiceAreas";

function ServiceAreaFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ServiceAreaInput;
  onChange: (next: ServiceAreaInput) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Country *
        </span>
        <CarrierCountrySelect
          id={`${idPrefix}-country`}
          value={value.country}
          onChange={(country) => onChange({ ...value, country })}
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-600">
          State
        </span>
        <input
          id={`${idPrefix}-state`}
          className="crm-input w-full"
          value={value.state}
          onChange={(event) =>
            onChange({ ...value, state: event.target.value })
          }
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-600">
          City
        </span>
        <input
          id={`${idPrefix}-city`}
          className="crm-input w-full"
          value={value.city}
          onChange={(event) =>
            onChange({ ...value, city: event.target.value })
          }
        />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Service radius (miles)
        </span>
        <input
          id={`${idPrefix}-radius`}
          className="crm-input w-full max-w-xs"
          inputMode="numeric"
          value={value.serviceRadiusMiles}
          onChange={(event) =>
            onChange({ ...value, serviceRadiusMiles: event.target.value })
          }
        />
      </label>
    </div>
  );
}

export function CarrierServiceAreasModal({
  open,
  carrierId,
  areas,
  editContext,
  onClose,
  onUpdated,
  onSuccess,
  onError,
}: {
  open: boolean;
  carrierId: string;
  areas: CarrierServiceAreaRow[];
  editContext: CarrierEditContext;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [localAreas, setLocalAreas] = useState<CarrierServiceAreaRow[]>(areas);
  const [newArea, setNewArea] = useState<ServiceAreaInput>(EMPTY_SERVICE_AREA_INPUT);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ServiceAreaInput>(EMPTY_SERVICE_AREA_INPUT);
  const [savingNew, setSavingNew] = useState(false);
  const [savingAreaId, setSavingAreaId] = useState<string | null>(null);
  const [removingAreaId, setRemovingAreaId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLocalAreas(areas);
      setNewArea(EMPTY_SERVICE_AREA_INPUT);
      setEditingAreaId(null);
    }
  }, [open, areas]);

  useEffect(() => {
    setLocalAreas(areas);
  }, [areas]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingNew && !savingAreaId && !removingAreaId) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, savingNew, savingAreaId, removingAreaId]);

  if (!open) return null;

  async function handleAddArea(event: FormEvent) {
    event.preventDefault();
    setSavingNew(true);
    const { data, error } = await addCarrierServiceAreaClient({
      carrierId,
      country: newArea.country,
      state: newArea.state,
      city: newArea.city,
      serviceRadiusMiles: newArea.serviceRadiusMiles,
      editContext,
    });
    setSavingNew(false);

    if (error || !data) {
      onError(error ?? "Unable to add service area.");
      return;
    }

    setNewArea(EMPTY_SERVICE_AREA_INPUT);
    onSuccess(data.message);
    await onUpdated();
  }

  async function handleSaveEdit(areaId: string) {
    setSavingAreaId(areaId);
    const { data, error } = await updateCarrierServiceAreaClient({
      carrierId,
      areaId,
      country: editDraft.country,
      state: editDraft.state,
      city: editDraft.city,
      serviceRadiusMiles: editDraft.serviceRadiusMiles,
      editContext,
    });
    setSavingAreaId(null);

    if (error || !data) {
      onError(error ?? "Unable to update service area.");
      return;
    }

    setEditingAreaId(null);
    onSuccess(data.message);
    await onUpdated();
  }

  async function handleRemoveArea(area: CarrierServiceAreaRow) {
    const confirmed = window.confirm(
      `Remove service area "${formatServiceAreaLabel(area)}"?`,
    );
    if (!confirmed) return;

    setRemovingAreaId(area.id);
    const { data, error } = await removeCarrierServiceAreaClient({
      carrierId,
      areaId: area.id,
      editContext,
    });
    setRemovingAreaId(null);

    if (error || !data) {
      onError(error ?? "Unable to remove service area.");
      return;
    }

    if (editingAreaId === area.id) {
      setEditingAreaId(null);
    }

    onSuccess(data.message);
    await onUpdated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Edit Service Areas
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Shared coverage for the company-wide Carrier Network.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingNew || Boolean(savingAreaId) || Boolean(removingAreaId)}
            className="crm-btn-secondary crm-btn-sm"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          {localAreas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No service areas added yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {localAreas.map((area) => {
                const isEditing = editingAreaId === area.id;
                const isSaving = savingAreaId === area.id;
                const isRemoving = removingAreaId === area.id;

                return (
                  <li
                    key={area.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <ServiceAreaFields
                          idPrefix={`edit-${area.id}`}
                          value={editDraft}
                          onChange={setEditDraft}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void handleSaveEdit(area.id)}
                            className="crm-btn-primary crm-btn-sm disabled:opacity-60"
                          >
                            {isSaving ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => setEditingAreaId(null)}
                            className="crm-btn-secondary crm-btn-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <p className="text-sm text-slate-800">
                          {formatServiceAreaLabel(area)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={Boolean(savingAreaId) || Boolean(removingAreaId)}
                            onClick={() => {
                              setEditingAreaId(area.id);
                              setEditDraft(serviceAreaRowToInput(area));
                            }}
                            className="crm-btn-secondary crm-btn-sm"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isRemoving || Boolean(savingAreaId)}
                            onClick={() => void handleRemoveArea(area)}
                            className="crm-btn-secondary crm-btn-sm text-red-700"
                          >
                            {isRemoving ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form
            onSubmit={handleAddArea}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Add service area
            </h3>
            <div className="mt-3">
              <ServiceAreaFields
                idPrefix="new-area"
                value={newArea}
                onChange={setNewArea}
              />
            </div>
            <button
              type="submit"
              disabled={savingNew}
              className="crm-btn-primary crm-btn-sm mt-4 disabled:opacity-60"
            >
              {savingNew ? "Adding..." : "Add service area"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
