"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CarrierAddFormModal } from "@/components/carrier-add-form-modal";
import { CityFilterCombobox } from "@/components/city-filter-combobox";
import { CarrierTableRow, SharedCarrierReadOnlyNotice } from "@/components/carrier-directory-shared";
import { CrmAlert, EmptyState, PageHeader } from "@/components/crm-ui";
import {
  addCarrierToMyCarriers,
  createCarrier,
  removeCarrierFromMyCarriers,
  updateMyCarrierRelationship,
} from "@/lib/carrierClient";
import { CARRIER_COUNTRY_FILTER_OPTIONS } from "@/lib/carrierCountries";
import {
  CARRIER_EQUIPMENT_LABELS,
  CARRIER_EQUIPMENT_TYPES,
  CARRIER_SERVICE_LABELS,
  CARRIER_SERVICE_TYPES,
  CARRIER_STATUSES,
  CARRIER_STATUS_LABELS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_STATUS_LABELS,
  type BondedFilter,
  type HazmatFilter,
} from "@/lib/carrierConstants";
import {
  carrierMatchesFilters,
  EMPTY_CARRIER_DIRECTORY_FILTERS,
  fetchCarrierNetwork,
  fetchMyCarriers,
  getActiveFilterChips,
  type CarrierDirectoryFilters,
  type CarrierListItem,
} from "@/lib/carrierDirectory";
import type { CarrierFormInput } from "@/lib/carrierValidation";
import { formatSupabaseError } from "@/lib/crmFormat";
import { carrierDetailHref } from "@/lib/carrierEditContext";
import {
  formatRegionOptionLabel,
  getStateFilterOptionsForCountry,
} from "@/lib/locationData";
import {
  carrierMatchesCountryStateFilters,
  getAvailableCities,
  isCityFilterValueValid,
} from "@/lib/locationFilters";
import { fetchUserProfile, isAdminProfile } from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

type DirectoryTab = "my" | "network";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CarrierDirectoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DirectoryTab>("my");
  const [networkCarriers, setNetworkCarriers] = useState<CarrierListItem[]>([]);
  const [myCarriers, setMyCarriers] = useState<CarrierListItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<CarrierDirectoryFilters>(
    EMPTY_CARRIER_DIRECTORY_FILTERS,
  );
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateCarrierId, setDuplicateCarrierId] = useState<string | null>(
    null,
  );
  const [duplicateCarrierName, setDuplicateCarrierName] = useState<string | null>(
    null,
  );
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async (userId: string) => {
    setFetchError(null);
    const [networkResult, myResult] = await Promise.all([
      fetchCarrierNetwork(),
      fetchMyCarriers(userId),
    ]);

    if (networkResult.error) {
      setFetchError(formatSupabaseError(networkResult.error));
      return;
    }

    if (myResult.error) {
      setFetchError(formatSupabaseError(myResult.error));
      return;
    }

    const myByCarrierId = new Map(
      myResult.data.map((carrier) => [carrier.id, carrier.userRelationship]),
    );

    setNetworkCarriers(
      networkResult.data.map((carrier) => ({
        ...carrier,
        userRelationship: myByCarrierId.get(carrier.id) ?? null,
      })),
    );
    setMyCarriers(myResult.data);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: authUser }, error }) => {
      if (error || !authUser) {
        router.replace("/login");
        return;
      }

      setUser(authUser);
      const { data: profile } = await fetchUserProfile(authUser.id);
      setIsAdmin(isAdminProfile(profile));
      await loadData(authUser.id);
      setLoading(false);
    });
  }, [router, loadData]);

  useEffect(() => {
    setFilters((current) => ({ ...current, search: debouncedSearch }));
  }, [debouncedSearch]);

  const sourceCarriers = tab === "my" ? myCarriers : networkCarriers;

  const stateFilterOptions = useMemo(
    () => getStateFilterOptionsForCountry(filters.country),
    [filters.country],
  );

  const locationFilteredCarriers = useMemo(
    () =>
      filters.country === "all"
        ? []
        : sourceCarriers.filter((carrier) =>
            carrierMatchesCountryStateFilters(
              carrier,
              filters.country,
              filters.state,
            ),
          ),
    [sourceCarriers, filters.country, filters.state],
  );

  const cityFilterOptions = useMemo(
    () =>
      getAvailableCities(
        locationFilteredCarriers,
        filters.country,
        filters.state,
      ),
    [locationFilteredCarriers, filters.country, filters.state],
  );

  const activeFilters = useMemo(() => {
    if (
      filters.city !== "all" &&
      (filters.country === "all" ||
        !isCityFilterValueValid(filters.city, cityFilterOptions))
    ) {
      return { ...filters, city: "all" };
    }

    return filters;
  }, [filters, cityFilterOptions]);

  const filteredCarriers = useMemo(
    () =>
      sourceCarriers.filter((carrier) =>
        carrierMatchesFilters(carrier, activeFilters),
      ),
    [sourceCarriers, activeFilters],
  );

  const activeChips = useMemo(
    () => getActiveFilterChips(activeFilters, tab),
    [activeFilters, tab],
  );

  function clearFilters() {
    setSearchInput("");
    setFilters(EMPTY_CARRIER_DIRECTORY_FILTERS);
  }

  async function handleCreateCarrier(form: CarrierFormInput) {
    if (!user) return;

    setCreating(true);
    setCreateError(null);
    setDuplicateCarrierId(null);
    setDuplicateCarrierName(null);

    const { data, error, duplicateCarrierId, duplicateCarrierName } =
      await createCarrier(form);

    if (error === "DUPLICATE" && duplicateCarrierId) {
      setDuplicateCarrierId(duplicateCarrierId);
      setDuplicateCarrierName(duplicateCarrierName ?? null);
      setCreateError("This carrier already exists in the Carrier Network.");
      setCreating(false);
      return;
    }

    if (error) {
      setCreateError(error);
      setCreating(false);
      return;
    }

    setAddModalOpen(false);
    setSuccessMessage(data?.message ?? "Carrier created.");
    await loadData(user.id);
    setTab("my");
    setCreating(false);

    if (data?.carrierId) {
      router.push(carrierDetailHref(data.carrierId, "my"));
    }
  }

  async function handleAddExisting(carrierId: string) {
    if (!user) return;
    setCreating(true);
    const { data, error } = await addCarrierToMyCarriers(carrierId);
    setCreating(false);

    if (error) {
      setCreateError(error);
      return;
    }

    setAddModalOpen(false);
    setDuplicateCarrierId(null);
    setSuccessMessage(data?.message ?? "Carrier added to My Carriers.");
    await loadData(user.id);
    setTab("my");
  }

  async function handleAddToMyCarriers(carrierId: string) {
    if (!user) return;
    setActionLoadingId(carrierId);
    const { data, error } = await addCarrierToMyCarriers(carrierId);
    setActionLoadingId(null);

    if (error) {
      setFetchError(error);
      return;
    }

    setSuccessMessage(data?.message ?? "Carrier added to My Carriers.");
    await loadData(user.id);
  }

  async function handleRemoveFromMyCarriers(carrierId: string) {
    if (!user) return;
    const confirmed = window.confirm(
      "Remove this carrier from My Carriers? The shared carrier record will remain in the Carrier Network.",
    );
    if (!confirmed) return;

    setActionLoadingId(carrierId);
    const { data, error } = await removeCarrierFromMyCarriers(carrierId);
    setActionLoadingId(null);

    if (error) {
      setFetchError(error);
      return;
    }

    setSuccessMessage(data?.message ?? "Carrier removed from My Carriers.");
    await loadData(user.id);
  }

  async function handleTogglePreferred(carrierId: string, nextPreferred: boolean) {
    setActionLoadingId(carrierId);
    const { error } = await updateMyCarrierRelationship({
      carrierId,
      isPreferred: nextPreferred,
    });
    setActionLoadingId(null);

    if (error) {
      setFetchError(error);
      return;
    }

    if (user) {
      await loadData(user.id);
    }
  }

  if (loading) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading carrier directory...</p>
      </div>
    );
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <PageHeader
        title="Logistics Masters Carrier Network"
        description="One shared company-wide carrier directory with your private broker relationships."
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setDuplicateCarrierId(null);
              setAddModalOpen(true);
            }}
            className="crm-btn-primary"
          >
            Add Carrier
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setTab("my")}
          className={
            tab === "my"
              ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900"
              : "px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
          }
        >
          My Carriers
        </button>
        <button
          type="button"
          onClick={() => setTab("network")}
          className={
            tab === "network"
              ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900"
              : "px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
          }
        >
          Carrier Network
        </button>
      </div>

      {fetchError ? <CrmAlert variant="error">{fetchError}</CrmAlert> : null}
      {successMessage ? (
        <CrmAlert variant="success">{successMessage}</CrmAlert>
      ) : null}

      {tab === "network" && !isAdmin ? (
        <div className="mb-4">
          <SharedCarrierReadOnlyNotice />
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 lg:grid-cols-4">
        <label className="lg:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Search carriers
          </span>
          <input
            className="crm-input w-full"
            placeholder="Name, MC, DOT, SCAC, phone, email, city, state..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Service Type
          </span>
          <select
            className="crm-select w-full"
            value={filters.serviceType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                serviceType: event.target.value as CarrierDirectoryFilters["serviceType"],
              }))
            }
          >
            <option value="all">All</option>
            {CARRIER_SERVICE_TYPES.map((value) => (
              <option key={value} value={value}>
                {CARRIER_SERVICE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Equipment Type
          </span>
          <select
            className="crm-select w-full"
            value={filters.equipmentType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                equipmentType: event.target.value as CarrierDirectoryFilters["equipmentType"],
              }))
            }
          >
            <option value="all">All</option>
            {CARRIER_EQUIPMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {CARRIER_EQUIPMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Country
          </span>
          <select
            className="crm-select w-full"
            value={filters.country}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                country: event.target.value,
                state: "all",
                city: "all",
              }))
            }
          >
            {CARRIER_COUNTRY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            State
          </span>
          <select
            className="crm-select w-full"
            value={filters.country === "all" ? "all" : filters.state}
            disabled={filters.country === "all"}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                state: event.target.value,
                city: "all",
              }))
            }
          >
            <option value="all">All</option>
            {stateFilterOptions.map((region) => (
              <option key={region.abbreviation} value={region.abbreviation}>
                {formatRegionOptionLabel(region)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            City
          </span>
          <CityFilterCombobox
            value={filters.country === "all" ? "all" : activeFilters.city}
            options={cityFilterOptions}
            disabled={filters.country === "all"}
            disabledMessage="Select a country first"
            emptyMessage="No cities available for this location"
            noMatchMessage="No cities found"
            onChange={(city) =>
              setFilters((current) => ({ ...current, city }))
            }
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Carrier Status
          </span>
          <select
            className="crm-select w-full"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as CarrierDirectoryFilters["status"],
              }))
            }
          >
            <option value="all">All</option>
            {CARRIER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CARRIER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Bonded
          </span>
          <select
            className="crm-select w-full"
            value={filters.bonded}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                bonded: event.target.value as BondedFilter,
              }))
            }
          >
            <option value="all">All</option>
            <option value="bonded">Bonded only</option>
            <option value="not_bonded">Not bonded</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Hazmat
          </span>
          <select
            className="crm-select w-full"
            value={filters.hazmat}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                hazmat: event.target.value as HazmatFilter,
              }))
            }
          >
            <option value="all">All</option>
            <option value="hazmat">Hazmat only</option>
            <option value="not_hazmat">Not hazmat</option>
          </select>
        </label>
        {tab === "my" ? (
          <>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={filters.preferredOnly}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    preferredOnly: event.target.checked,
                  }))
                }
              />
              <span className="text-sm text-slate-700">Preferred only</span>
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Relationship Status
              </span>
              <select
                className="crm-select w-full"
                value={filters.relationshipStatus}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    relationshipStatus: event.target.value as CarrierDirectoryFilters["relationshipStatus"],
                  }))
                }
              >
                <option value="all">All</option>
                {RELATIONSHIP_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {RELATIONSHIP_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      {activeChips.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {chip.label}
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {filteredCarriers.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={
              tab === "my"
                ? "No carriers in My Carriers yet"
                : "No carriers match your filters"
            }
            description={
              tab === "my"
                ? "Add a new carrier or link an existing carrier from the Carrier Network."
                : "Try adjusting your search or filters."
            }
          />
          {tab === "my" ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="crm-btn-primary"
              >
                Add Carrier
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Carrier
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 md:table-cell">
                  MC / DOT
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 lg:table-cell">
                  Services
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 xl:table-cell">
                  Equipment
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 2xl:table-cell">
                  Coverage
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Bonded
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Hazmat
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="min-w-[17rem] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCarriers.map((carrier) => (
                <CarrierTableRow
                  key={carrier.id}
                  carrier={carrier}
                  tab={tab}
                  isAdmin={isAdmin}
                  actionLoadingId={actionLoadingId}
                  onRemoveFromMyCarriers={handleRemoveFromMyCarriers}
                  onTogglePreferred={handleTogglePreferred}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CarrierAddFormModal
        open={addModalOpen}
        isAdmin={isAdmin}
        submitting={creating}
        error={createError}
        duplicateCarrierId={duplicateCarrierId}
        duplicateCarrierName={duplicateCarrierName}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleCreateCarrier}
        onAddExisting={handleAddExisting}
      />
    </AuthenticatedLayout>
  );
}
