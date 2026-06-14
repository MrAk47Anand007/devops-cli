const statusCards = [
  {
    title: "Runtime health",
    value: "98.6%",
    detail: "Seven services green across the latest watchdog window."
  },
  {
    title: "Approval load",
    value: "3 pending",
    detail: "Two production gates and one secrets rotation awaiting review."
  },
  {
    title: "Automation",
    value: "14 active",
    detail: "Pipelines, monitors, and scheduled recoveries are currently running."
  }
];

export function StatusRail(): JSX.Element {
  return (
    <section
      aria-atomic="false"
      aria-live="polite"
      aria-label="Live status"
      aria-relevant="text"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {statusCards.map((card) => (
        <article
          key={card.title}
          className="rounded-3xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-panel backdrop-blur"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            {card.title}
          </h2>
          <p className="mt-4 text-3xl font-semibold text-white">{card.value}</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">{card.detail}</p>
        </article>
      ))}
    </section>
  );
}
