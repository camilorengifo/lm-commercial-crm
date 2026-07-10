"use client";

import Link from "next/link";
import { carrierDetailHref } from "@/lib/carrierEditContext";

export function CarrierTableRowActions({
  carrierId,
  tab,
  isAdmin,
  inMyCarriers,
  isPreferred,
  loading,
  onRemoveFromMyCarriers,
  onTogglePreferred,
}: {
  carrierId: string;
  tab: "network" | "my";
  isAdmin: boolean;
  inMyCarriers: boolean;
  isPreferred: boolean;
  loading: boolean;
  onRemoveFromMyCarriers: (carrierId: string) => void;
  onTogglePreferred: (carrierId: string, nextPreferred: boolean) => void;
}) {
  const pageContext = tab === "my" ? "my" : "network";
  const showEdit = isAdmin || (tab === "my" && inMyCarriers);
  const showMyCarriersActions = tab === "my" || inMyCarriers;

  const editHref = isAdmin
    ? carrierDetailHref(carrierId, "network", { edit: true })
    : carrierDetailHref(carrierId, "my", { edit: true });

  return (
    <div className="flex flex-nowrap items-center gap-1">
      <Link
        href={carrierDetailHref(carrierId, pageContext)}
        className="crm-btn-primary crm-btn-sm shrink-0 whitespace-nowrap"
      >
        View
      </Link>

      {showEdit ? (
        <Link
          href={editHref}
          className="crm-btn-secondary crm-btn-sm shrink-0 whitespace-nowrap"
        >
          Edit
        </Link>
      ) : null}

      {showMyCarriersActions ? (
        <>
          <button
            type="button"
            disabled={loading}
            onClick={() => onTogglePreferred(carrierId, !isPreferred)}
            className="crm-btn-secondary crm-btn-sm shrink-0 whitespace-nowrap disabled:opacity-50"
            title={isPreferred ? "Remove preferred status" : "Mark as preferred"}
          >
            {loading ? "..." : isPreferred ? "Unfavorite" : "Preferred"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onRemoveFromMyCarriers(carrierId)}
            className="crm-btn-danger crm-btn-sm shrink-0 whitespace-nowrap disabled:opacity-50"
            title="Remove from My Carriers"
          >
            {loading ? "..." : "Remove"}
          </button>
        </>
      ) : null}
    </div>
  );
}
