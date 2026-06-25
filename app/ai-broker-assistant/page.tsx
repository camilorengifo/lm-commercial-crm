import { Suspense } from "react";
import { AiBrokerAssistantPage } from "@/components/ai-broker-assistant-page";

export default function AiBrokerAssistantRoute() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-zinc-500">
          Loading AI Broker Assistant...
        </div>
      }
    >
      <AiBrokerAssistantPage />
    </Suspense>
  );
}
