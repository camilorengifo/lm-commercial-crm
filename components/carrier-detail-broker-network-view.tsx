"use client";

import Link from "next/link";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CarrierDetailSharedSections } from "@/components/carrier-detail-shared-sections";
import { CrmAlert, PageHeader } from "@/components/crm-ui";
import type { CarrierListItem } from "@/lib/carrierDirectory";

export function CarrierDetailBrokerNetworkView({
  carrier,
  inMyCarriers,
  fetchError,
  successMessage,
  actionLoading,
  onAddToMyCarriers,
  onRemoveFromMyCarriers,
}: {
  carrier: CarrierListItem;
  inMyCarriers: boolean;
  fetchError: string | null;
  successMessage: string | null;
  actionLoading: boolean;
  onAddToMyCarriers: () => void;
  onRemoveFromMyCarriers: () => void;
}) {
  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1100px]">
      <PageHeader
        title={carrier.legal_name}
        description={carrier.dba_name ? `DBA: ${carrier.dba_name}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/carrier-directory" className="crm-btn-secondary">
              Back to Carrier Network
            </Link>
            {!inMyCarriers ? (
              <button
                type="button"
                disabled={actionLoading}
                onClick={onAddToMyCarriers}
                className="crm-btn-primary"
              >
                Add to My Carriers
              </button>
            ) : (
              <button
                type="button"
                disabled={actionLoading}
                onClick={onRemoveFromMyCarriers}
                className="crm-btn-secondary"
              >
                Remove from My Carriers
              </button>
            )}
          </div>
        }
      />

      {fetchError ? <CrmAlert variant="error">{fetchError}</CrmAlert> : null}
      {successMessage ? <CrmAlert variant="success">{successMessage}</CrmAlert> : null}

      <div className="grid gap-5">
        <CarrierDetailSharedSections carrier={carrier} showReadOnlyNotice />
      </div>
    </AuthenticatedLayout>
  );
}
