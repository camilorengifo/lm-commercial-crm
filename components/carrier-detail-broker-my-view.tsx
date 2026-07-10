"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CarrierAddFormModal } from "@/components/carrier-add-form-modal";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  CarrierDetailRelationshipSection,
  type CarrierRelationshipFormState,
} from "@/components/carrier-detail-relationship-section";
import { CarrierDetailSharedSections } from "@/components/carrier-detail-shared-sections";
import { CrmAlert, PageHeader } from "@/components/crm-ui";
import { updateCarrierShared } from "@/lib/carrierClient";
import type { CarrierListItem } from "@/lib/carrierDirectory";
import { carrierToForm } from "@/lib/carrierForm";
import type { CarrierFormInput } from "@/lib/carrierValidation";

export function CarrierDetailBrokerMyView({
  carrier,
  fetchError,
  successMessage,
  relationshipForm,
  savingRelationship,
  actionLoading,
  editModalOpen,
  onOpenEditModal,
  onRelationshipFormChange,
  onSaveRelationship,
  onRemoveFromMyCarriers,
  onDetailUpdated,
  onSuccess,
  onError,
  onCloseEditModal,
}: {
  carrier: CarrierListItem;
  fetchError: string | null;
  successMessage: string | null;
  relationshipForm: CarrierRelationshipFormState;
  savingRelationship: boolean;
  actionLoading: boolean;
  editModalOpen: boolean;
  onOpenEditModal: () => void;
  onRelationshipFormChange: (
    updater: (current: CarrierRelationshipFormState) => CarrierRelationshipFormState,
  ) => void;
  onSaveRelationship: (event: FormEvent) => void;
  onRemoveFromMyCarriers: () => void;
  onDetailUpdated: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onCloseEditModal: () => void;
}) {
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSaveCarrier(form: CarrierFormInput) {
    setSavingCarrier(true);
    setEditError(null);
    const { error } = await updateCarrierShared({
      carrierId: carrier.id,
      form,
      editContext: "my",
    });
    setSavingCarrier(false);

    if (error) {
      setEditError(error);
      onError(error);
      return;
    }

    onSuccess("Carrier information updated.");
    onCloseEditModal();
    await onDetailUpdated();
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1100px]">
      <PageHeader
        title={carrier.legal_name}
        description={carrier.dba_name ? `DBA: ${carrier.dba_name}` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/carrier-directory" className="crm-btn-secondary">
              Back to My Carriers
            </Link>
            <button
              type="button"
              onClick={onOpenEditModal}
              className="crm-btn-primary"
            >
              Edit My Carrier
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={onRemoveFromMyCarriers}
              className="crm-btn-secondary"
            >
              Remove from My Carriers
            </button>
          </div>
        }
      />

      {fetchError ? <CrmAlert variant="error">{fetchError}</CrmAlert> : null}
      {successMessage ? <CrmAlert variant="success">{successMessage}</CrmAlert> : null}

      <div className="grid gap-5">
        <CarrierDetailSharedSections
          carrier={carrier}
          showReadOnlyNotice={false}
        />
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Edits from My Carriers update the shared company-wide carrier record
          visible in the Carrier Network.
        </p>
        <CarrierDetailRelationshipSection
          carrier={carrier}
          inMyCarriers
          relationshipForm={relationshipForm}
          savingRelationship={savingRelationship}
          onRelationshipFormChange={onRelationshipFormChange}
          onSaveRelationship={onSaveRelationship}
          onAddToMyCarriers={() => undefined}
        />
      </div>

      <CarrierAddFormModal
        open={editModalOpen}
        mode="edit"
        initialForm={carrierToForm(carrier)}
        isAdmin={false}
        submitting={savingCarrier}
        error={editError}
        duplicateCarrierId={null}
        duplicateCarrierName={null}
        onClose={onCloseEditModal}
        onSubmit={handleSaveCarrier}
        onAddExisting={() => undefined}
      />
    </AuthenticatedLayout>
  );
}
