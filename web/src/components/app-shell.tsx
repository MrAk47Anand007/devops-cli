import type { ReactNode } from "react";
import { NavSidebar } from "./nav-sidebar";
import { StatusRail } from "./status-rail";

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-dashboard-glow bg-slate-950 text-slate-50">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-6">
        <NavSidebar />
        <main className="flex min-w-0 flex-col gap-6">
          <StatusRail />
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
