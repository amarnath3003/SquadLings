import type { AgentId, Approval, BoardNote, BotId, BotResult, BotStatus, Box, Bug, Plan, RunOptions, RunResult, RunStatus, ToolName, Usage, Viewport } from './types';
export interface EventData {
  'run.created': { request: string; templateId: string; options: RunOptions };
  'run.template_selected': { templateId: string; confidence: number };
  'run.status': { status: RunStatus };
  'master.status': { status: 'planning' | 'monitoring' | 'merging' | 'done' };
  'master.text': { text: string };
  'plan.ready': { plan: Plan };
  'bot.spawned': { botId: BotId; name: string; color: string; roleId: string; roleName: string; goal: string; viewport: Viewport; device: 'desktop' | 'mobile' };
  'bot.status': { botId: BotId; status: BotStatus; reason?: string };
  'bot.caption': { botId: BotId; text: string };
  'tool.called': { botId?: BotId; agent?: AgentId; callId: string; tool: ToolName; args: Record<string, unknown> };
  'tool.result': { callId: string; ok: boolean; code?: string; summary: string; ms: number };
  'cursor.move': { botId: BotId; x: number; y: number; box?: Box; durationMs: number };
  'cursor.click': { botId: BotId; x: number; y: number };
  'cursor.type': { botId: BotId; x: number; y: number; length: number; masked: boolean };
  'cursor.scroll': { botId: BotId; dy: number };
  'page.navigated': { botId: BotId; url: string; title: string };
  'page.loading': { botId: BotId; loading: boolean };
  'page.dialog': { botId: BotId; kind: string; message: string };
  'frame': { botId: BotId; jpeg: string; w: number; h: number; seq: number };
  'frame.keyframe': { botId: BotId; file: string; w: number; h: number };
  'board.posted': { note: BoardNote };
  'board.delivered': { botId: BotId; noteIds: string[] };
  'gate.checked': { botId: BotId; action: string; level: 'allow' | 'confirm' | 'block'; probability?: number; via: string; ms: number };
  'safety.blocked': { botId: BotId; code: string; reason: string; url?: string };
  'approval.requested': { approval: Approval };
  'approval.resolved': { approvalId: string; status: Approval['status']; by: string };
  'takeover.started': { botId: BotId; durationMs?: number };
  'takeover.ended': { botId: BotId; durationMs?: number };
  'decision.made': { purpose: string; ms: number; questions: unknown[] };
  'qa.bug': { bug: Bug };
  'bot.result': { botId: BotId; result: BotResult['result']; summary: string };
  'bot.error': { botId: BotId; message: string; retryable: boolean };
  'usage.updated': Usage & { runTotalUSD: number };
  'run.result': { result: RunResult };
  'run.ended': { status: RunStatus; durationMs: number; costUSD: number };
  'agents.raw': { sessionId: string; event: unknown };
}
export type EventType = keyof EventData;
// A mapped union keeps payload narrowing sound for both the backend and the UI.
export type SwarmEvent<T extends EventType = EventType> = { [K in T]: {
  id: string; runId: string; seq: number; ts: number;
  source: 'orchestrator' | 'master' | 'bot' | 'browser' | 'safety' | 'board' | 'decisions' | 'user';
  botId?: BotId; type: K; data: EventData[K];
} }[T];
export type SquadLingsEvent<T extends EventType = EventType> = SwarmEvent<T>;
export function eventBotId(event: SwarmEvent): BotId | undefined {
  if (event.botId) return event.botId;
  if ('botId' in event.data) return event.data.botId;
  if (event.type === 'approval.requested') return event.data.approval.botId;
  if (event.type === 'qa.bug') return event.data.bug.botId;
  if (event.type === 'board.posted' && event.data.note.from.startsWith('bot')) return event.data.note.from as BotId;
}
