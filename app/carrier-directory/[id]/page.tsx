import { Suspense } from "react";
import { CarrierDetailPage } from "@/components/carrier-detail-page";

export default function CarrierDetail() {
  return (
    <Suspense
      fallback={
        <div className="crm-loading-screen">
          <p className="text-sm text-slate-500">Loading carrier...</p>
        </div>
      }
    >
      <CarrierDetailPage />
    </Suspense>
  );
}
