import { Link, useParams } from "react-router-dom";
import { IncidentDetailPanel } from "../components/incident-detail-panel";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchIncident, fetchIncidents } from "../lib/api";
import type { IncidentRecord } from "../lib/types";

interface IncidentDetailResponse {
  incident: IncidentRecord | null;
}

export function IncidentPage(): JSX.Element {
  const { incidentId } = useParams();
  const live = useLiveDashboardRefresh([
    "incident.created",
    "incident.updated",
    "alert.created",
    "log.created",
    "scenario.loaded"
  ]);
  const incidentQuery = useDashboardQuery<IncidentDetailResponse>(
    () => (incidentId ? fetchIncident(incidentId) : Promise.resolve({ incident: null })),
    [incidentId ?? "", live.refreshToken]
  );
  const incidentsQuery = useDashboardQuery(fetchIncidents, [live.refreshToken]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Incidents</p>
          <h1 className="mt-3 text-4xl font-semibold">Incident Workspace</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Investigate the active incident record, linked service, and escalation status.
          </p>
        </div>
        <IncidentDetailPanel
          error={incidentQuery.error}
          incident={incidentQuery.data?.incident ?? null}
          loading={Boolean(incidentId) && incidentQuery.loading}
        />
      </div>
      <div className="grid gap-6">
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Incident backlog</h2>
          {incidentsQuery.error ? (
            <p className="mt-3 text-sm text-rose-300">{incidentsQuery.error.message}</p>
          ) : incidentsQuery.loading ? (
            <p className="mt-3 text-sm text-slate-300">Loading incidents...</p>
          ) : (
            <ul className="mt-3 grid gap-3 text-sm text-slate-300">
              {(incidentsQuery.data?.incidents ?? []).map((incident) => (
                <li key={incident.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <Link className="block hover:text-cyan-200" to={`/incidents/${incident.id}`}>
                    <span className="block font-medium text-white">{incident.summary}</span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.25em] text-slate-400">
                      {incident.serviceId}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
