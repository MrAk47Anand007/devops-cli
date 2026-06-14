import { cn } from "../lib/utils";

const navItems = [
  { label: "Overview", active: true },
  { label: "Automation" },
  { label: "Approvals" },
  { label: "Integrations" }
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
              <div
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm text-slate-300",
                  item.active && "border-cyan-400/30 bg-cyan-400/10 text-white"
                )}
              >
                <span>{item.label}</span>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  {item.active ? "Live" : "Queue"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
