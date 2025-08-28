import AppSidebar from "../components/AppSidebar";

type Props = { children: React.ReactNode };

export default function DashboardShell({ children }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-50">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <AppSidebar />
          <main className="flex-1 p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
