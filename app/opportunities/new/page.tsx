import { Suspense } from "react";
import { OpportunityNewPage } from "@/components/opportunity-new-page";

export default function NewOpportunityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      }
    >
      <OpportunityNewPage />
    </Suspense>
  );
}
