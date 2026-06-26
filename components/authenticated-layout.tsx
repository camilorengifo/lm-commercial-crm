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
      <div className="crm-app-bg flex min-h-screen flex-col lg:flex-row">
        <AppNav />
        <main className="crm-main">
          <div className={`crm-page-inner ${maxWidthClass}`}>{children}</div>
        </main>
      </div>
    </ActiveUserGuard>
  );
}
