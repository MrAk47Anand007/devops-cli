import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  { label: "Overview", status: "Live", to: "/" },
  { label: "Automation", status: "Queue", to: "/automation" },
  { label: "Approvals", status: "Queue", to: "/approvals" },
  { label: "Incidents", status: "Live", to: "/incidents" },
  { label: "Integrations", status: "Queue", to: "/integrations" }
  ,
  { label: "Memory", status: "Audit", to: "/memory" },
  { label: "Settings", status: "Config", to: "/settings" }
];

export function NavSidebar(): JSX.Element {
  return (
    <aside className="rounded-3xl border border-slate-800/90 bg-slate-900/85 p-5 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-cyan-300">
            SentinelOps
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Control Center</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-300">
            Operator shell for deploy signals, approvals, and live runtime posture.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          Live sync
        </div>
      </div>

      <nav aria-label="Primary navigation" className="mt-6">
        <ul className="grid gap-3">
          {navItems.map((item) => (
            <li key={item.label}>
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm text-slate-300 transition focus-visible:ring-offset-slate-950 hover:border-cyan-400/30 hover:bg-slate-800/80 hover:text-white",
                    isActive && "border-cyan-400/30 bg-cyan-400/10 text-white"
                  )
                }
                end={item.to === "/"}
                to={item.to}
              >
                <span>{item.label}</span>
                <span
                  aria-hidden="true"
                  className="text-xs uppercase tracking-[0.3em] text-slate-500"
                >
                  {item.status}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
