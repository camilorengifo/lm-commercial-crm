"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyAdminAccess } from "@/lib/admin";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    verifyAdminAccess().then((result) => {
      if (!result.allowed) {
        router.replace(result.reason === "unauthenticated" ? "/login" : "/dashboard");
        return;
      }

      setAllowed(true);
    });
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Checking admin access...</p>
      </div>
    );
  }

  return <>{children}</>;
}
