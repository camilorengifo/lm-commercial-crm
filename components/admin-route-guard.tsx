"use client";

import { AdminAuthProvider } from "@/components/admin-auth-context";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}
