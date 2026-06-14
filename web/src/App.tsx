export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">SentinelOps</p>
        <h1 className="mt-3 text-4xl font-semibold">SentinelOps Control Center</h1>
        <nav className="mt-8 flex gap-3 text-sm text-slate-300">
          <span>Overview</span>
          <span>Automation</span>
          <span>Approvals</span>
          <span>Integrations</span>
        </nav>
      </main>
    </div>
  );
}
