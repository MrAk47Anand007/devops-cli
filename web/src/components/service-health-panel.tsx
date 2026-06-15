import { Link } from "react-router-dom";
import type { RuntimeLiveResponse, Service } from "../lib/types";

export function ServiceHealthPanel({
  runtimeError,
  runtimeLoading,
  runtime,
  services,
  loading,
  error
}: {
  runtimeError: Error | null;
  runtimeLoading: boolean;
  runtime: RuntimeLiveResponse | null;
  services: Service[];
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Service health</h2>
          <p className="mt-2 text-sm text-slate-300">
            Backend service inventory paired with the latest runtime deploy snapshot.
          </p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading services...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && services.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No services are currently reported by the backend.</p>
      ) : null}

      {services.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {services.map((service) => {
            const runtimeService = runtime?.services.find((entry) => entry.serviceId === service.id) ?? null;

            return (
              <li key={service.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{service.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                      {service.id}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.25em] text-slate-300">
                    <span className="rounded-full border border-slate-700 px-2 py-1">
                      {service.environment}
                    </span>
                    <span className="rounded-full border border-slate-700 px-2 py-1">
                      {service.health}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Revision: {runtimeService?.revision ?? "not available"}
                </p>
                {runtimeError ? (
                  <p className="mt-1 text-sm text-amber-300">
                    Runtime snapshot unavailable: {runtimeError.message}
                  </p>
                ) : runtimeLoading ? (
                  <p className="mt-1 text-sm text-slate-400">Runtime snapshot is still loading.</p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">
                    {runtimeService?.revisionDetail ?? "Runtime snapshot has not reported a revision yet."}
                  </p>
                )}
                <Link
                  className="mt-4 inline-flex text-sm text-cyan-300 hover:text-cyan-200"
                  to={`/services/${service.id}`}
                >
                  Open service drill-down
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
