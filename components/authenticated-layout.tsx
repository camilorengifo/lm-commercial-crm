import { AppNav } from "@/components/app-nav";

export function AuthenticatedLayout({
  children,
  maxWidthClass = "max-w-6xl",
}: {
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="min-h-full flex-1 bg-zinc-50">
      <AppNav />
      <div className={`mx-auto px-4 py-8 ${maxWidthClass}`}>{children}</div>
    </div>
  );
}
