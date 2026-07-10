"use client";

import type { ReactNode } from "react";
import {
  BondedBadge,
  CarrierEquipmentList,
  CarrierServicesList,
  CarrierStatusBadge,
  HazmatBadge,
  SharedCarrierReadOnlyNotice,
} from "@/components/carrier-directory-shared";
import { CrmCard, SectionHeader } from "@/components/crm-ui";
import { formatServiceAreaLabel } from "@/lib/carrierServiceAreas";
import type { CarrierListItem } from "@/lib/carrierDirectory";
import { summarizeCoverage } from "@/lib/carrierDirectory";
import { formatDateTime } from "@/lib/crmFormat";
import { formatMcDotLine } from "@/lib/carrierNormalization";

export function CarrierDetailSharedSections({
  carrier,
  showReadOnlyNotice = false,
  serviceAreaError = null,
  serviceAreaMessage = null,
  serviceAreasActions = null,
}: {
  carrier: CarrierListItem;
  showReadOnlyNotice?: boolean;
  serviceAreaError?: string | null;
  serviceAreaMessage?: string | null;
  serviceAreasActions?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <SectionHeader
          title="Shared Carrier Information"
          description="Company-wide carrier master record in the Carrier Network."
        />
        {showReadOnlyNotice ? (
          <div className="mt-3">
            <SharedCarrierReadOnlyNotice />
          </div>
        ) : null}
      </div>

      <CrmCard>
        <SectionHeader title="Carrier Information" />
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">MC / DOT</dt>
            <dd className="text-sm text-slate-900">
              {formatMcDotLine(carrier.mc_number, carrier.dot_number)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">SCAC</dt>
            <dd className="text-sm text-slate-900">{carrier.scac ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Phone</dt>
            <dd className="text-sm text-slate-900">{carrier.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Email</dt>
            <dd className="text-sm text-slate-900">{carrier.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Website</dt>
            <dd className="text-sm text-slate-900">
              {carrier.website ? (
                <a
                  href={carrier.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline-offset-2 hover:underline"
                >
                  {carrier.website}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Status</dt>
            <dd className="mt-1">
              <CarrierStatusBadge status={carrier.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Created</dt>
            <dd className="text-sm text-slate-900">
              {formatDateTime(carrier.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Last Updated</dt>
            <dd className="text-sm text-slate-900">
              {formatDateTime(carrier.updated_at)}
            </dd>
          </div>
        </dl>
      </CrmCard>

      <CrmCard>
        <SectionHeader title="Capabilities" />
        <div className="mt-4 flex flex-wrap gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Bonded</p>
            <div className="mt-1">
              <BondedBadge isBonded={carrier.is_bonded} />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {carrier.is_bonded ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Hazmat</p>
            <div className="mt-1">
              <HazmatBadge isHazmat={carrier.is_hazmat} />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {carrier.is_hazmat ? "Yes" : "No"}
            </p>
          </div>
        </div>
      </CrmCard>

      <CrmCard>
        <SectionHeader title="Services" />
        <div className="mt-3">
          <CarrierServicesList carrier={carrier} />
        </div>
      </CrmCard>

      <CrmCard>
        <SectionHeader title="Equipment" />
        <div className="mt-3">
          <CarrierEquipmentList carrier={carrier} />
        </div>
      </CrmCard>

      <CrmCard>
        <SectionHeader title="Service Areas" actions={serviceAreasActions} />
        {serviceAreaError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serviceAreaError}
          </p>
        ) : null}
        {serviceAreaMessage ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {serviceAreaMessage}
          </p>
        ) : null}
        {carrier.serviceAreas.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No service areas added.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {carrier.serviceAreas.map((area) => (
              <li key={area.id} className="text-sm text-slate-700">
                {formatServiceAreaLabel(area)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate-500">
          Coverage summary:{" "}
          {carrier.serviceAreas.length === 0
            ? "No service areas added"
            : summarizeCoverage(carrier)}
        </p>
      </CrmCard>

      <CrmCard>
        <SectionHeader title="Shared Contacts" />
        {carrier.contacts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No shared contacts recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {carrier.contacts.map((contact) => (
              <li key={contact.id} className="py-3">
                <p className="font-medium text-slate-900">
                  {contact.name}
                  {contact.is_primary ? (
                    <span className="ml-2 text-xs text-blue-700">Primary</span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-600">{contact.role ?? "—"}</p>
                <p className="text-sm text-slate-600">
                  {[contact.phone, contact.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CrmCard>
    </div>
  );
}
