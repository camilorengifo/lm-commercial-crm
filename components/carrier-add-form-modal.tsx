"use client";

import { FormEvent, useEffect, useState } from "react";
import { CarrierCountrySelect } from "@/components/carrier-country-select";
import {
  CARRIER_CONTACT_ROLES,
  CARRIER_EQUIPMENT_TYPES,
  CARRIER_EQUIPMENT_LABELS,
  CARRIER_SERVICE_TYPES,
  CARRIER_SERVICE_LABELS,
  CARRIER_STATUSES,
  CARRIER_STATUS_LABELS,
} from "@/lib/carrierConstants";
import type { CarrierFormInput } from "@/lib/carrierValidation";
import {
  EMPTY_CARRIER_CONTACT,
  EMPTY_CARRIER_FORM,
  EMPTY_CARRIER_SERVICE_AREA,
} from "@/lib/carrierValidation";

export function CarrierAddFormModal({
  open,
  mode = "create",
  initialForm,
  isAdmin,
  submitting,
  error,
  duplicateCarrierId,
  duplicateCarrierName,
  onClose,
  onSubmit,
  onAddExisting,
}: {
  open: boolean;
  mode?: "create" | "edit";
  initialForm?: CarrierFormInput;
  isAdmin: boolean;
  submitting: boolean;
  error: string | null;
  duplicateCarrierId: string | null;
  duplicateCarrierName: string | null;
  onClose: () => void;
  onSubmit: (form: CarrierFormInput) => void;
  onAddExisting: (carrierId: string) => void;
}) {
  const [form, setForm] = useState<CarrierFormInput>(EMPTY_CARRIER_FORM);
  const isEditMode = mode === "edit";

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_CARRIER_FORM);
      return;
    }
    if (isEditMode && initialForm) {
      setForm(initialForm);
    }
  }, [open, isEditMode, initialForm]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  function toggleServiceType(value: string) {
    setForm((current) => ({
      ...current,
      serviceTypes: current.serviceTypes.includes(value as never)
        ? current.serviceTypes.filter((item) => item !== value)
        : [...current.serviceTypes, value as never],
    }));
  }

  function toggleEquipmentType(value: string) {
    setForm((current) => ({
      ...current,
      equipmentTypes: current.equipmentTypes.includes(value as never)
        ? current.equipmentTypes.filter((item) => item !== value)
        : [...current.equipmentTypes, value as never],
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(form);
  }

  const statusOptions = isAdmin
    ? CARRIER_STATUSES
    : CARRIER_STATUSES.filter((status) => status !== "do_not_use");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isEditMode ? "Edit My Carrier" : "Add Carrier"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isEditMode
                ? "Updates the shared carrier record for the entire company Carrier Network."
                : "Create a shared carrier in the Logistics Masters Carrier Network."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="crm-btn-secondary crm-btn-sm"
          >
            Close
          </button>
        </div>

        {duplicateCarrierId && !isEditMode ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">
              This carrier already exists in the Carrier Network.
            </p>
            {duplicateCarrierName ? (
              <p className="mt-1">{duplicateCarrierName}</p>
            ) : null}
            <button
              type="button"
              disabled={submitting}
              onClick={() => onAddExisting(duplicateCarrierId)}
              className="mt-3 text-sm font-semibold text-amber-900 underline-offset-2 hover:underline"
            >
              Add to My Carriers
            </button>
          </div>
        ) : null}

        {error && (!duplicateCarrierId || isEditMode) ? (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Carrier Information
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Legal Carrier Name *
                </span>
                <input
                  className="crm-input w-full"
                  value={form.legalName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      legalName: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  DBA Name
                </span>
                <input
                  className="crm-input w-full"
                  value={form.dbaName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dbaName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Status
                </span>
                <select
                  className="crm-select w-full"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as CarrierFormInput["status"],
                    }))
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {CARRIER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  MC Number
                </span>
                <input
                  className="crm-input w-full"
                  value={form.mcNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      mcNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  DOT Number
                </span>
                <input
                  className="crm-input w-full"
                  value={form.dotNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dotNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  SCAC
                </span>
                <input
                  className="crm-input w-full"
                  value={form.scac}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scac: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Main Phone
                </span>
                <input
                  className="crm-input w-full"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Main Email
                </span>
                <input
                  type="email"
                  className="crm-input w-full"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Website
                </span>
                <input
                  className="crm-input w-full"
                  value={form.website}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      website: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Carrier Capabilities
            </h3>
            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.isBonded}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isBonded: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    Bonded
                  </span>
                  <span className="block text-xs text-slate-500">
                    Carrier is authorized to transport bonded freight.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.isHazmat}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isHazmat: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    Hazmat
                  </span>
                  <span className="block text-xs text-slate-500">
                    Carrier is authorized to transport hazardous materials.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Service Types</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {CARRIER_SERVICE_TYPES.map((serviceType) => (
                <label
                  key={serviceType}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.serviceTypes.includes(serviceType)}
                    onChange={() => toggleServiceType(serviceType)}
                  />
                  {CARRIER_SERVICE_LABELS[serviceType]}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Equipment Types</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {CARRIER_EQUIPMENT_TYPES.map((equipmentType) => (
                <label
                  key={equipmentType}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.equipmentTypes.includes(equipmentType)}
                    onChange={() => toggleEquipmentType(equipmentType)}
                  />
                  {CARRIER_EQUIPMENT_LABELS[equipmentType]}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Service Areas</h3>
            <div className="mt-3 space-y-3">
              {form.serviceAreas.map((area, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Country
                    </span>
                    <CarrierCountrySelect
                      value={area.country}
                      onChange={(country) =>
                        setForm((current) => ({
                          ...current,
                          serviceAreas: current.serviceAreas.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, country }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <input
                    className="crm-input"
                    placeholder="State"
                    value={area.state}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        serviceAreas: current.serviceAreas.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, state: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    className="crm-input"
                    placeholder="City"
                    value={area.city}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        serviceAreas: current.serviceAreas.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, city: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    className="crm-input"
                    placeholder="Radius (miles)"
                    value={area.serviceRadiusMiles}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        serviceAreas: current.serviceAreas.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, serviceRadiusMiles: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="crm-btn-secondary crm-btn-sm"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    serviceAreas: [
                      ...current.serviceAreas,
                      { ...EMPTY_CARRIER_SERVICE_AREA },
                    ],
                  }))
                }
              >
                Add service area
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Contact Information
            </h3>
            <div className="mt-3 space-y-3">
              {form.contacts.map((contact, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2"
                >
                  <input
                    className="crm-input"
                    placeholder="Name"
                    value={contact.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contacts: current.contacts.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <select
                    className="crm-select"
                    value={contact.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contacts: current.contacts.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, role: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  >
                    {CARRIER_CONTACT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <input
                    className="crm-input"
                    placeholder="Phone"
                    value={contact.phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contacts: current.contacts.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, phone: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    className="crm-input"
                    placeholder="Email"
                    value={contact.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contacts: current.contacts.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, email: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="crm-btn-secondary crm-btn-sm"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    contacts: [
                      ...current.contacts,
                      { ...EMPTY_CARRIER_CONTACT, isPrimary: false },
                    ],
                  }))
                }
              >
                Add contact
              </button>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="crm-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="crm-btn-primary disabled:opacity-60"
            >
              {submitting
                ? isEditMode
                  ? "Saving..."
                  : "Creating..."
                : isEditMode
                  ? "Save My Carrier"
                  : "Create Carrier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
