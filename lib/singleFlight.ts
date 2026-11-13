import { useState } from "react";

export type SingleFlightBegin =
  | { ok: true; clientRequestId: string }
  | { ok: false };

/**
 * Synchronous in-flight lock for one form action.
 *
 * The second call returns before React re-renders a disabled button.
 * A rejected attempt keeps its request id so a retry of the same payload
 * is the same request. A committed attempt, or a changed payload, gets a new id.
 */
export function createSingleFlightGate() {
  let inFlight = false;
  let requestId: string | null = null;
  let fingerprint: string | null = null;

  return {
    tryBegin(nextFingerprint: string): SingleFlightBegin {
      if (inFlight) return { ok: false };
      inFlight = true;
      if (!requestId || fingerprint !== nextFingerprint) {
        requestId = crypto.randomUUID();
        fingerprint = nextFingerprint;
      }
      return { ok: true, clientRequestId: requestId };
    },
    finish(outcome: "committed" | "rejected") {
      if (!inFlight) return;
      inFlight = false;
      if (outcome === "committed") {
        requestId = null;
        fingerprint = null;
      }
    },
  };
}

export type SingleFlightGate = ReturnType<typeof createSingleFlightGate>;

export function useSingleFlightGate(): SingleFlightGate {
  const [gate] = useState(createSingleFlightGate);
  return gate;
}
