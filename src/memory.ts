import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IncidentSchema, type Incident } from "./types.js";

const DEFAULT_INCIDENTS_PATH = fileURLToPath(new URL("../data/incidents.json", import.meta.url));

function getIncidentsPath(): string {
  return resolve(process.env.SENTINELOPS_INCIDENTS_PATH ?? DEFAULT_INCIDENTS_PATH);
}

function ensureIncidentStore(): void {
  const filePath = getIncidentsPath();
  const folder = dirname(filePath);
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n");
  }
}

export function loadIncidents(): Incident[] {
  ensureIncidentStore();
  const raw = JSON.parse(readFileSync(getIncidentsPath(), "utf8")) as unknown[];
  return raw.map((incident) => IncidentSchema.parse(incident));
}

export function findSimilar(metrics: {
  errorRate: number;
  latencyP95: number;
}): Incident | null {
  const incidents = loadIncidents();
  if (incidents.length === 0) {
    return null;
  }

  let best: Incident | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const incident of incidents) {
    const distance =
      Math.abs(incident.errorRate - metrics.errorRate) / 0.1 +
      Math.abs(incident.latencyP95 - metrics.latencyP95) / 1000;
    if (distance < bestDistance) {
      best = incident;
      bestDistance = distance;
    }
  }

  return best;
}

export function appendIncident(incident: Incident): Incident[] {
  const incidents = loadIncidents();
  incidents.push(IncidentSchema.parse(incident));
  writeFileSync(getIncidentsPath(), `${JSON.stringify(incidents, null, 2)}\n`);
  return incidents;
}

export function recordIncident(incident: Incident): Incident[] {
  return appendIncident(incident);
}
