import { AppShell } from "./components/app-shell";

export default function App(): JSX.Element {
  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">SentinelOps</p>
          <h1 className="mt-3 text-4xl font-semibold">SentinelOps Control Center</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Live deploy signals, runtime health, approvals, and automation status from the
            real SentinelOps backend.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Approvals</h2>
          <p className="mt-3 text-sm text-slate-300">Pending decisions will appear here.</p>
        </div>
      </section>
    </AppShell>
  );
}
