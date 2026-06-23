import { AppNav } from "@/components/app-nav";
import { ActiveUserGuard } from "@/components/active-user-guard";

export function AuthenticatedLayout({
  children,
  maxWidthClass = "max-w-6xl",
}: {
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <ActiveUserGuard>
      <div className="min-h-full flex-1 bg-zinc-50">
        <AppNav />
        <div className={`mx-auto px-4 py-8 ${maxWidthClass}`}>{children}</div>
      </div>
    </ActiveUserGuard>
  );
}
