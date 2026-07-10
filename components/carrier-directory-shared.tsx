"use client";

import {
  bondedBadgeClass,
  carrierStatusBadgeClass,
  type CarrierStatus,
  formatCarrierStatus,
  formatEquipmentType,
  formatServiceType,
  hazmatBadgeClass,
} from "@/lib/carrierConstants";
import { CarrierTableRowActions } from "@/components/carrier-table-row-actions";
import type { CarrierListItem } from "@/lib/carrierDirectory";
import { summarizeCoverage } from "@/lib/carrierDirectory";
import { formatMcDotLine } from "@/lib/carrierNormalization";

export function SharedCarrierReadOnlyNotice() {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      Shared carrier information — only administrators can edit.
    </p>
  );
}

export function CarrierStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${carrierStatusBadgeClass(status as CarrierStatus)}`}
    >
      {formatCarrierStatus(status)}
    </span>
  );
}

export function BondedBadge({ isBonded }: { isBonded: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${bondedBadgeClass(isBonded)}`}
    >
      {isBonded ? "Bonded" : "Not Bonded"}
    </span>
  );
}

export function HazmatBadge({ isHazmat }: { isHazmat: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${hazmatBadgeClass(isHazmat)}`}
    >
      {isHazmat ? "Hazmat" : "No Hazmat"}
    </span>
  );
}

export function CarrierServicesList({ carrier }: { carrier: CarrierListItem }) {
  if (carrier.services.length === 0) {
    return <span className="text-sm text-slate-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {carrier.services.map((service) => (
        <span
          key={service}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          {formatServiceType(service)}
        </span>
      ))}
    </div>
  );
}

export function CarrierEquipmentList({ carrier }: { carrier: CarrierListItem }) {
  if (carrier.equipment.length === 0) {
    return <span className="text-sm text-slate-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {carrier.equipment.slice(0, 4).map((equipment) => (
        <span
          key={equipment}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          {formatEquipmentType(equipment)}
        </span>
      ))}
      {carrier.equipment.length > 4 ? (
        <span className="text-xs text-slate-500">
          +{carrier.equipment.length - 4}
        </span>
      ) : null}
    </div>
  );
}

export function CarrierTableRow({
  carrier,
  tab,
  isAdmin,
  onRemoveFromMyCarriers,
  onTogglePreferred,
  actionLoadingId,
}: {
  carrier: CarrierListItem;
  tab: "network" | "my";
  isAdmin: boolean;
  onRemoveFromMyCarriers: (carrierId: string) => void;
  onTogglePreferred: (carrierId: string, nextPreferred: boolean) => void;
  actionLoadingId: string | null;
}) {
  const inMyCarriers = Boolean(carrier.userRelationship);
  const isPreferred = carrier.userRelationship?.is_preferred ?? false;
  const loading = actionLoadingId === carrier.id;

  return (
    <tr className="border-b border-slate-100 bg-white hover:bg-slate-50/80">
      <td className="px-3 py-3 align-top">
        <div>
          <p className="font-medium text-slate-900">{carrier.legal_name}</p>
          {carrier.dba_name ? (
            <p className="text-xs text-slate-500">DBA: {carrier.dba_name}</p>
          ) : null}
          {carrier.scac ? (
            <p className="text-xs text-slate-500">SCAC: {carrier.scac}</p>
          ) : null}
        </div>
      </td>
      <td className="hidden px-3 py-3 align-top text-sm text-slate-700 md:table-cell">
        {formatMcDotLine(carrier.mc_number, carrier.dot_number)}
      </td>
      <td className="hidden px-3 py-3 align-top lg:table-cell">
        <CarrierServicesList carrier={carrier} />
      </td>
      <td className="hidden px-3 py-3 align-top xl:table-cell">
        <CarrierEquipmentList carrier={carrier} />
      </td>
      <td className="hidden px-3 py-3 align-top text-sm text-slate-600 2xl:table-cell">
        {summarizeCoverage(carrier)}
      </td>
      <td className="hidden px-3 py-3 align-top sm:table-cell">
        <BondedBadge isBonded={carrier.is_bonded} />
      </td>
      <td className="hidden px-3 py-3 align-top sm:table-cell">
        <HazmatBadge isHazmat={carrier.is_hazmat} />
      </td>
      <td className="px-3 py-3 align-top">
        <CarrierStatusBadge status={carrier.status} />
      </td>
      <td className="min-w-[17rem] whitespace-nowrap px-3 py-3 align-middle">
        <CarrierTableRowActions
          carrierId={carrier.id}
          tab={tab}
          isAdmin={isAdmin}
          inMyCarriers={inMyCarriers}
          isPreferred={isPreferred}
          loading={loading}
          onRemoveFromMyCarriers={onRemoveFromMyCarriers}
          onTogglePreferred={onTogglePreferred}
        />
      </td>
    </tr>
  );
}
