// packages/shared/src/types.ts
export type RunId = string;
export type BotId = "bot1" | "bot2" | "bot3" | "bot4" | "bot5";
export type AgentId = BotId | "master";

export type RunStatus =
  | "created"
  | "classifying"
  | "planning"
  | "running"
  | "merging"
  | "completed"
  | "failed"
  | "cancelled";
export type BotStatus =
  | "pending"
  | "starting"
  | "working"
  | "thinking"
  | "waiting_user"
  | "paused"
  | "finished"
  | "failed"
  | "stopped"
  | "out_of_budget";
export type Mood =
  | "calm"
  | "curious"
  | "focused"
  | "bored"
  | "suspicious"
  | "found"
  | "worried"
  | "content"
  | "failed"
  | "happy";

export type ToolName =
  | "list_elements"
  | "read_text"
  | "look"
  | "screenshot"
  | "open"
  | "click"
  | "type"
  | "select"
  | "press"
  | "scroll"
  | "back"
  | "wait"
  | "post_to_board"
  | "read_board"
  | "ask_user"
  | "wait_for_user"
  | "finish"
  | "report_bug"
  | "get_errors"
  | "check_screen"
  | "submit_plan"
  | "get_bot_results"
  | "submit_final";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
}

export interface RunOptions {
  maxBots: number;
  budgetUSD?: number;
  targetUrl?: string;
}
export interface CreateRunInput {
  request: string;
  templateId: string | "auto";
  options: RunOptions;
}

export interface Budgets {
  maxActionsPerBot: number;
  maxToolCallsPerBot: number;
  maxMinutesPerBot: number;
  maxRunMinutes: number;
  maxRunCostUSD: number;
}
export interface SafetyPolicy {
  gate: "enforce" | "off";
  testTargets?: string[];
  blockPasswordFields: boolean;
  approvalTimeoutSec: number;
}
export interface RoleDef {
  id: string;
  name: string;
  purpose: string;
  startUrl?: string;
  allowedDomains: string[];
  tools: ToolName[];
  device?: "desktop" | "mobile";
  viewport?: Viewport;
  storageState?: string;
  goalHint: string;
  promptAddendum?: string;
  outputSchema: object; // JSON Schema
}
export interface Template {
  id: string;
  name: string;
  icon: string;
  description: string;
  maxBots: number;
  requires?: string[];
  defaults: { viewport: Viewport; locale: string; timezone: string };
  safety: SafetyPolicy;
  budgets: Budgets;
  boardNoteTypes: { type: string; label: string }[];
  toolsets?: Record<string, ToolName[]>; // YAML roles may name a toolset; the loader resolves it
  extraTools?: ToolName[];
  roleDefaults?: Partial<RoleDef>; // merged into every role before validation
  roles: RoleDef[];
  merge: { instructions: string; resultSchema: object };
}

export interface Assignment {
  roleId: string;
  goal: string;
  successCriteria: string[];
  startUrl?: string;
}
export interface Plan {
  title: string;
  assumptions: string[];
  assignments: Assignment[];
}

export interface BotSpec {
  id: BotId;
  name: string;
  color: string; // from cast.ts (§7.1)
  role: RoleDef;
  assignment: Assignment;
}

export interface BoardNote {
  id: string;
  seq: number;
  runId: RunId;
  from: AgentId | "user";
  to: "all" | BotId;
  type: string;
  title: string;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface Approval {
  id: string;
  runId: RunId;
  botId: BotId;
  kind: "confirm" | "login" | "question";
  title: string;
  detail: string;
  risk?: { level: "confirm"; probability?: number };
  screenshot?: string;
  elementBox?: Box;
  options?: string[];
  status: "pending" | "approved" | "skipped" | "answered" | "expired";
  answer?: string;
  createdAt: number;
  expiresAt: number;
}

export interface Bug {
  id: string;
  runId: RunId;
  botId: BotId;
  persona: string;
  title: string;
  category: string;
  severity: number; // 1–5 (Decisions score, rounded)
  steps: string[];
  expected: string;
  actual: string;
  url: string;
  screenshot: string;
  elementBox?: Box;
  duplicateOf?: string;
  plantedMatch?: string | null;
  createdAt: number;
}

export interface BotResult {
  botId: BotId;
  roleId: string;
  status: BotStatus;
  result?: unknown;
  summary?: string;
  error?: string;
  actions: number;
  toolCalls: number;
  durationMs: number;
  costUSD: number;
}

export interface Usage {
  agent: AgentId | "decisions" | "look";
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUSD: number;
  estimated: boolean;
}

export interface Scorecard {
  planted: number;
  found: number;
  falsePositives: number;
  matched: Record<string, string>; // plantedId → bugId
  durationSec: number;
  costUSD: number;
}

export interface RunResult {
  runId: RunId;
  templateId: string;
  title: string;
  result: unknown; // template resultSchema
  markdown: string;
  gaps: string[];
  bugs?: Bug[];
  scorecard?: Scorecard; // QA only
}
