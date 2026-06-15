import type { Decision, Incident, Metrics, Scenario } from "../types.js";

export type Unsubscribe = () => void;

export interface AdapterHealth {
  status: "ready" | "degraded" | "unavailable";
  checkedAt: number;
  detail: string;
}

export interface BaselineWindow {
  lookbackHours: number;
  sameHour?: boolean;
}

export interface MetricHistoryWindow {
  rangeMinutes: number;
  stepMinutes: number;
  baselineLookbackHours: number;
  sameHour?: boolean;
}

export interface DeployStatus {
  deployId: string;
  service: string;
  state: "pending" | "healthy" | "degraded" | "failed" | "rolled_back";
  scenario: Scenario;
}

export interface Revision {
  service: string;
  version: string;
  deployedAt: number;
}

export interface RollbackResult {
  deployId: string;
  ok: boolean;
  detail: string;
  dryRun: boolean;
  revision: Revision;
}

export interface JudgmentInput {
  metrics: Metrics;
  similarIncident: Incident | null;
}

export interface ApprovalPackage {
  incidentId: string;
  summary: string;
  evidence: string[];
}

export interface ThreadRef {
  id: string;
}

export interface HumanDecisionResult {
  action: "approve" | "override" | "hold";
  actor: string;
}

export interface RawWebhook {
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface DeployEvent {
  deployId: string;
  service: string;
  sha: string;
  target: string;
}

export interface MetricSource {
  id: string;
  query(expr: string): Promise<Metrics>;
  baseline(window: BaselineWindow): Promise<Metrics>;
  history?(window: MetricHistoryWindow): Promise<{
    current: Metrics[];
    baseline: Metrics[];
  }>;
  subscribe(cb: (metrics: Metrics) => void): Unsubscribe;
  health(): Promise<AdapterHealth>;
}

export interface DeployTarget {
  id: string;
  status(deployId: string): Promise<DeployStatus>;
  currentRevision(service: string): Promise<Revision>;
  rollback(deployId: string, opts: { dryRun: boolean }): Promise<RollbackResult>;
  health(): Promise<AdapterHealth>;
}

export interface JudgmentBrain {
  id: string;
  decide(input: JudgmentInput): Promise<Decision>;
  health(): Promise<AdapterHealth>;
}

export interface ChatChannel {
  id: string;
  postApproval(pkg: ApprovalPackage): Promise<ThreadRef>;
  awaitDecision(ref: ThreadRef, timeoutMs: number): Promise<HumanDecisionResult>;
  notify(ref: ThreadRef, update: string): Promise<void>;
}

export interface Trigger {
  id: string;
  toDeployEvent(raw: RawWebhook): DeployEvent | null;
  verifySignature(raw: RawWebhook): boolean;
}
