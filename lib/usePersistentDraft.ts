"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export const COMPANY_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_VERSION = 1;

export type CompanyDraftModule =
  | "followup"
  | "ai-outreach"
  | "contact-create"
  | "contact-edit"
  | "notes"
  | "section"
  | (string & {});

interface DraftEnvelope<T> {
  version: number;
  updatedAt: number;
  data: T;
}

export function companyDraftKey(
  companyId: string,
  module: CompanyDraftModule,
): string {
  return `company-draft:${companyId}:${module}`;
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function readCompanyDraft<T>(key: string): T | null {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (
      !parsed ||
      parsed.version !== DRAFT_VERSION ||
      typeof parsed.updatedAt !== "number" ||
      parsed.data === undefined
    ) {
      sessionStorage.removeItem(key);
      return null;
    }

    if (Date.now() - parsed.updatedAt > COMPANY_DRAFT_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

export function writeCompanyDraft<T>(key: string, data: T): void {
  if (!canUseSessionStorage()) return;

  try {
    const envelope: DraftEnvelope<T> = {
      version: DRAFT_VERSION,
      updatedAt: Date.now(),
      data,
    };
    sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota / private mode — fail silently.
  }
}

export function clearCompanyDraft(key: string): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function usePersistentDraft<T>({
  key,
  initialValue,
  isEmpty,
  debounceMs = 300,
  enabled = true,
}: {
  key: string;
  initialValue: T;
  isEmpty?: (value: T) => boolean;
  debounceMs?: number;
  enabled?: boolean;
}): [T, Dispatch<SetStateAction<T>>, () => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const initialRef = useRef(initialValue);

  useEffect(() => {
    initialRef.current = initialValue;
  }, [initialValue]);

  useEffect(() => {
    if (!enabled) {
      setValue(initialRef.current);
      setHydrated(true);
      return;
    }

    const stored = readCompanyDraft<T>(key);
    setValue(stored ?? initialRef.current);
    setHydrated(true);
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !hydrated) return;

    const timer = window.setTimeout(() => {
      if (isEmpty?.(value)) {
        clearCompanyDraft(key);
        return;
      }
      writeCompanyDraft(key, value);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [value, key, hydrated, debounceMs, enabled, isEmpty]);

  const clear = useCallback(() => {
    clearCompanyDraft(key);
    setValue(initialRef.current);
  }, [key]);

  return [value, setValue, clear, hydrated];
}
