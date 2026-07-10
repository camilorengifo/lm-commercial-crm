"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  CarrierDetailRelationshipSection,
  type CarrierRelationshipFormState,
} from "@/components/carrier-detail-relationship-section";
import { CarrierDetailSharedSections } from "@/components/carrier-detail-shared-sections";
import { CarrierServiceAreasModal } from "@/components/carrier-service-areas-modal";
import { CarrierSharedEditor } from "@/components/carrier-shared-editor";
import { CrmAlert, PageHeader } from "@/components/crm-ui";
import type { CarrierListItem } from "@/lib/carrierDirectory";

export function CarrierDetailAdminView({
  carrier,
  inMyCarriers,
  fetchError,
  successMessage,
  relationshipForm,
  savingRelationship,
  actionLoading,
  startInEditMode,
  onRelationshipFormChange,
  onSaveRelationship,
  onAddToMyCarriers,
  onRemoveFromMyCarriers,
  onArchiveCarrier,
  onSetDoNotUse,
  onDetailUpdated,
  onSuccess,
  onError,
}: {
  carrier: CarrierListItem;
  inMyCarriers: boolean;
  fetchError: string | null;
  successMessage: string | null;
  relationshipForm: CarrierRelationshipFormState;
  savingRelationship: boolean;
  actionLoading: boolean;
  startInEditMode: boolean;
  onRelationshipFormChange: (
    updater: (current: CarrierRelationshipFormState) => CarrierRelationshipFormState,
  ) => void;
  onSaveRelationship: (event: FormEvent) => void;
  onAddToMyCarriers: () => void;
  onRemoveFromMyCarriers: () => void;
  onArchiveCarrier: () => void;
  onSetDoNotUse: () => void;
  onDetailUpdated: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [serviceAreasModalOpen, setServiceAreasModalOpen] = useState(false);
  const [serviceAreaMessage, setServiceAreaMessage] = useState<string | null>(null);
  const [serviceAreaError, setServiceAreaError] = useState<string | null>(null);

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1100px]">
      <PageHeader
        title={carrier.legal_name}
        description={carrier.dba_name ? `DBA: ${carrier.dba_name}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/carrier-directory" className="crm-btn-secondary">
              Back
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
            <button
              type="button"
              disabled={actionLoading}
              onClick={onSetDoNotUse}
              className="crm-btn-secondary"
            >
              Do Not Use
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={onArchiveCarrier}
              className="crm-btn-secondary"
            >
              Archive
            </button>
          </div>
        }
      />

      {fetchError ? <CrmAlert variant="error">{fetchError}</CrmAlert> : null}
      {successMessage ? <CrmAlert variant="success">{successMessage}</CrmAlert> : null}

      <div className="grid gap-5">
        <CarrierDetailSharedSections
          carrier={carrier}
          serviceAreaError={serviceAreaError}
          serviceAreaMessage={serviceAreaMessage}
          serviceAreasActions={
            <button
              type="button"
              onClick={() => {
                setServiceAreaError(null);
                setServiceAreaMessage(null);
                setServiceAreasModalOpen(true);
              }}
              className="crm-btn-secondary crm-btn-sm"
            >
              Edit Service Areas
            </button>
          }
        />

        <CarrierDetailRelationshipSection
          carrier={carrier}
          inMyCarriers={inMyCarriers}
          relationshipForm={relationshipForm}
          savingRelationship={savingRelationship}
          onRelationshipFormChange={onRelationshipFormChange}
          onSaveRelationship={onSaveRelationship}
          onAddToMyCarriers={onAddToMyCarriers}
        />

        <CarrierSharedEditor
          carrier={carrier}
          startInEditMode={startInEditMode}
          onUpdated={onDetailUpdated}
          onSuccess={onSuccess}
          onError={onError}
        />
      </div>

      <CarrierServiceAreasModal
        open={serviceAreasModalOpen}
        carrierId={carrier.id}
        areas={carrier.serviceAreas}
        editContext="network"
        onClose={() => setServiceAreasModalOpen(false)}
        onUpdated={onDetailUpdated}
        onSuccess={(message) => {
          setServiceAreaError(null);
          setServiceAreaMessage(message);
          onSuccess(message);
        }}
        onError={(message) => {
          setServiceAreaMessage(null);
          setServiceAreaError(message);
          onError(message);
        }}
      />
    </AuthenticatedLayout>
  );
}
