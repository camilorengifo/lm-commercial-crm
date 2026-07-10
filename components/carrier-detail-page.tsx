"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CarrierDetailAdminView } from "@/components/carrier-detail-admin-view";
import { CarrierDetailBrokerMyView } from "@/components/carrier-detail-broker-my-view";
import { CarrierDetailBrokerNetworkView } from "@/components/carrier-detail-broker-network-view";
import type { CarrierRelationshipFormState } from "@/components/carrier-detail-relationship-section";
import { CrmAlert } from "@/components/crm-ui";
import {
  addCarrierToMyCarriers,
  archiveCarrierAdmin,
  removeCarrierFromMyCarriers,
  updateCarrierStatusAdmin,
  updateMyCarrierRelationship,
} from "@/lib/carrierClient";
import {
  carrierDetailHref,
  parseCarrierPageContext,
} from "@/lib/carrierEditContext";
import { fetchCarrierDetail } from "@/lib/carrierDirectory";
import type { CarrierListItem, UserCarrierRow } from "@/lib/carrierDirectory";
import { formatSupabaseError } from "@/lib/crmFormat";
import { fetchUserProfile, isAdminProfile } from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

export function CarrierDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const carrierId = typeof params.id === "string" ? params.id : "";
  const pageContext = parseCarrierPageContext(searchParams.get("from"));
  const editMode = searchParams.get("edit") === "1";

  const [, setUser] = useState<User | null>(null);
  const [roleResolved, setRoleResolved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [carrier, setCarrier] = useState<CarrierListItem | null>(null);
  const [relationship, setRelationship] = useState<UserCarrierRow | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [relationshipForm, setRelationshipForm] = useState<CarrierRelationshipFormState>({
    privateNotes: "",
    isPreferred: false,
    relationshipStatus: "",
    lastContactedAt: "",
    preferredContactId: "",
  });
  const [savingRelationship, setSavingRelationship] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const ownsRelationship = Boolean(relationship);
  const canEditFromMyCarriers = ownsRelationship;
  const editModalOpen = editMode && canEditFromMyCarriers && !isAdmin;

  const loadDetail = useCallback(async () => {
    if (!carrierId) return;
    setFetchError(null);
    const { data, userRelationship, error } = await fetchCarrierDetail(carrierId);
    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }
    if (!data) {
      setFetchError("Carrier not found.");
      return;
    }
    setCarrier(data);
    setRelationship(userRelationship);
    setRelationshipForm({
      privateNotes: userRelationship?.private_notes ?? "",
      isPreferred: userRelationship?.is_preferred ?? false,
      relationshipStatus: userRelationship?.relationship_status ?? "",
      lastContactedAt: userRelationship?.last_contacted_at
        ? userRelationship.last_contacted_at.slice(0, 10)
        : "",
      preferredContactId: userRelationship?.preferred_contact_id ?? "",
    });
  }, [carrierId]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: authUser }, error }) => {
      if (error || !authUser) {
        router.replace("/login");
        return;
      }
      setUser(authUser);
      const { data: profile } = await fetchUserProfile(authUser.id);
      const admin = isAdminProfile(profile);
      setIsAdmin(admin);
      setRoleResolved(true);
      await loadDetail();
      setLoading(false);
    });
  }, [router, loadDetail]);

  useEffect(() => {
    if (loading || !roleResolved || !carrierId) return;

    if (isAdmin) {
      if (pageContext !== "network") {
        router.replace(carrierDetailHref(carrierId, "network", { edit: editMode }));
      }
      return;
    }

    if (pageContext === "my" && !ownsRelationship) {
      router.replace(carrierDetailHref(carrierId, "network"));
      return;
    }

    if (editMode && !(pageContext === "my" && ownsRelationship)) {
      router.replace(carrierDetailHref(carrierId, pageContext));
    }
  }, [
    loading,
    roleResolved,
    isAdmin,
    pageContext,
    ownsRelationship,
    editMode,
    carrierId,
    router,
  ]);

  function openEditModal() {
    router.push(carrierDetailHref(carrierId, "my", { edit: true }));
  }

  function closeEditModal() {
    router.push(carrierDetailHref(carrierId, "my"));
  }

  async function handleAddToMyCarriers() {
    if (!carrier) return;
    setActionLoading(true);
    const { error } = await addCarrierToMyCarriers(carrier.id);
    setActionLoading(false);
    if (error) {
      setFetchError(error);
      return;
    }
    setSuccessMessage("Carrier added to My Carriers.");
    await loadDetail();
    router.push(carrierDetailHref(carrier.id, "my"));
  }

  async function handleRemoveFromMyCarriers() {
    if (!carrier) return;
    const confirmed = window.confirm(
      "Remove this carrier from My Carriers? The shared carrier record will remain in the Carrier Network.",
    );
    if (!confirmed) return;
    setActionLoading(true);
    const { error } = await removeCarrierFromMyCarriers(carrier.id);
    setActionLoading(false);
    if (error) {
      setFetchError(error);
      return;
    }
    setSuccessMessage("Carrier removed from My Carriers.");
    await loadDetail();
    router.push(carrierDetailHref(carrier.id, "network"));
  }

  async function handleSaveRelationship(event: FormEvent) {
    event.preventDefault();
    if (!carrier) return;
    setSavingRelationship(true);
    const { error } = await updateMyCarrierRelationship({
      carrierId: carrier.id,
      privateNotes: relationshipForm.privateNotes || null,
      isPreferred: relationshipForm.isPreferred,
      relationshipStatus:
        (relationshipForm.relationshipStatus as never) || null,
      lastContactedAt: relationshipForm.lastContactedAt
        ? new Date(relationshipForm.lastContactedAt).toISOString()
        : null,
      preferredContactId: relationshipForm.preferredContactId || null,
    });
    setSavingRelationship(false);
    if (error) {
      setFetchError(error);
      return;
    }
    setSuccessMessage("Your private relationship was updated.");
    await loadDetail();
  }

  async function handleArchiveCarrier() {
    if (!carrier) return;
    const confirmed = window.confirm(
      "Archive this carrier in the shared Carrier Network? Linked My Carriers relationships will remain but the carrier will be marked inactive.",
    );
    if (!confirmed) return;
    setActionLoading(true);
    const { data, error } = await archiveCarrierAdmin(carrier.id);
    setActionLoading(false);
    if (error) {
      setFetchError(error);
      return;
    }
    setSuccessMessage(
      `${data?.message ?? "Carrier archived."}${
        data?.linkedUsers ? ` Linked users: ${data.linkedUsers}.` : ""
      }`,
    );
    await loadDetail();
  }

  async function handleSetDoNotUse() {
    if (!carrier) return;
    const confirmed = window.confirm(
      "Mark this carrier as Do Not Use? This is an admin-only action.",
    );
    if (!confirmed) return;
    setActionLoading(true);
    const { error } = await updateCarrierStatusAdmin({
      carrierId: carrier.id,
      status: "do_not_use",
    });
    setActionLoading(false);
    if (error) {
      setFetchError(error);
      return;
    }
    setSuccessMessage("Carrier marked as Do Not Use.");
    await loadDetail();
  }

  if (loading || !roleResolved) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading carrier...</p>
      </div>
    );
  }

  if (!carrier) {
    return (
      <AuthenticatedLayout>
        <CrmAlert variant="error">{fetchError ?? "Carrier not found."}</CrmAlert>
        <Link href="/carrier-directory" className="mt-4 inline-block text-sm underline">
          Back to Carrier Directory
        </Link>
      </AuthenticatedLayout>
    );
  }

  const sharedViewProps = {
    carrier,
    inMyCarriers: ownsRelationship,
    fetchError,
    successMessage,
    relationshipForm,
    savingRelationship,
    actionLoading,
    onRelationshipFormChange: setRelationshipForm,
    onSaveRelationship: handleSaveRelationship,
    onAddToMyCarriers: handleAddToMyCarriers,
    onRemoveFromMyCarriers: handleRemoveFromMyCarriers,
  };

  if (isAdmin) {
    return (
      <CarrierDetailAdminView
        {...sharedViewProps}
        startInEditMode={editMode}
        onArchiveCarrier={handleArchiveCarrier}
        onSetDoNotUse={handleSetDoNotUse}
        onDetailUpdated={loadDetail}
        onSuccess={setSuccessMessage}
        onError={setFetchError}
      />
    );
  }

  if (pageContext === "my" && ownsRelationship) {
    return (
      <CarrierDetailBrokerMyView
        carrier={carrier}
        fetchError={fetchError}
        successMessage={successMessage}
        relationshipForm={relationshipForm}
        savingRelationship={savingRelationship}
        actionLoading={actionLoading}
        editModalOpen={editModalOpen}
        onOpenEditModal={openEditModal}
        onCloseEditModal={closeEditModal}
        onRelationshipFormChange={setRelationshipForm}
        onSaveRelationship={handleSaveRelationship}
        onRemoveFromMyCarriers={handleRemoveFromMyCarriers}
        onDetailUpdated={loadDetail}
        onSuccess={setSuccessMessage}
        onError={setFetchError}
      />
    );
  }

  return <CarrierDetailBrokerNetworkView {...sharedViewProps} />;
}
