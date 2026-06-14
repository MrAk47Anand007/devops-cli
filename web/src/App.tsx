export default function App(): JSX.Element {
  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <p className="app-shell__eyebrow">SentinelOps</p>
        <h1 className="app-shell__title">SentinelOps Control Center</h1>
        <nav aria-label="Primary" className="app-shell__nav">
          <ul className="app-shell__nav-list">
            <li>Overview</li>
            <li>Automation</li>
            <li>Approvals</li>
            <li>Integrations</li>
          </ul>
        </nav>
      </main>
    </div>
  );
}
