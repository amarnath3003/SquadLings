import type { Mood } from '@swarm/shared/types';
import type { SwarmEvent } from '@swarm/shared/events';
export const PRIORITY: Mood[] = ['failed', 'worried', 'found', 'content', 'suspicious', 'happy', 'focused', 'bored', 'curious', 'calm'];
export interface Condition { key: string; mood: Mood; from: number; until?: number; ended?: boolean }
export function currentMood(conditions: Condition[], now: number): Mood {
  return PRIORITY.find(mood => conditions.some(c => c.mood === mood && c.from <= now && (c.until === undefined || c.until > now))) ?? 'calm';
}
export function updateConditions(previous: Condition[], event: SwarmEvent, now: number): Condition[] {
  let conditions = previous.filter(c => c.until === undefined || c.until > now);
  const remove = (key: string, hold = 0) => {
    conditions = conditions.flatMap(c => c.key !== key ? [c] : c.from + hold > now ? [{ ...c, ended: true, until: c.from + hold }] : []);
  };
  const add = (key: string, mood: Mood, duration?: number, delay = 0) => {
    remove(key); conditions.push({ key, mood, from: now + delay, ...(duration === undefined ? {} : { until: now + delay + duration }) });
  };
  switch (event.type) {
    case 'tool.called': {
      for (const c of conditions.filter(c => c.key.startsWith('tool:'))) remove(c.key, 400);
      remove('thinking', 400);
      const tool = event.data.tool;
      const mood = ['open', 'click', 'type', 'select', 'press', 'scroll', 'back'].includes(tool) ? 'focused' : tool === 'wait' ? 'bored' : 'curious';
      add(`tool:${event.data.callId}`, mood); break;
    }
    case 'tool.result': remove(`tool:${event.data.callId}`, 400); if (!event.data.ok) add('error', 'failed', 1200); break;
    case 'bot.status':
      if (event.data.status === 'failed') add('terminal-error', 'failed');
      if (event.data.status === 'thinking' && !conditions.some(c => c.key.startsWith('tool:') && !c.ended)) add('thinking', 'curious');
      else remove('thinking', 400);
      break;
    case 'page.loading': if (event.data.loading) add('loading', 'bored', undefined, 700); else remove('loading'); break;
    case 'approval.requested': add(`apr:${event.data.approval.id}`, 'worried'); break;
    case 'approval.resolved': remove(`apr:${event.data.approvalId}`); if (event.data.status === 'approved' || event.data.status === 'answered') add('ok', 'content', 1200); break;
    case 'safety.blocked': add('block', 'worried', 2000); break;
    case 'gate.checked': if (event.data.level === 'confirm') add('gate', 'suspicious', 900); break;
    case 'board.posted': add(`note:${event.data.note.id}`, 'found', 1200); break;
    case 'qa.bug': add(`bug:${event.data.bug.id}`, 'found', 1200); break;
    case 'board.delivered': add('mail', 'curious', 600); break;
    case 'takeover.started': add('takeover', 'worried'); break;
    case 'takeover.ended': remove('takeover'); add('ok', 'content', 1200); break;
    case 'bot.error': add('error', 'failed', event.data.retryable ? 1200 : undefined); break;
    case 'bot.result': add('done', 'happy'); break;
  }
  return conditions;
}
