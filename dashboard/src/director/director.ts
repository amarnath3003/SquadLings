import type { BotId } from '@swarm/shared/types';
import { eventBotId, type SwarmEvent } from '@swarm/shared/events';
import { castFor } from '@swarm/shared/cast';
import type { Actor } from '../characters/useBotActor';
import type { Point } from '../mood/attention';
import { center } from './geometry';
import { burst } from '../effects/EffectsCanvas';
import { fly,clearFlights } from '../effects/Flights';
import { sound } from '../effects/sound';
import { PERSONALITY,hash } from '../characters/personality';
import { useDashboard } from '../store';
import { create } from 'zustand';
interface Entry { actor:Actor;map:(p:Point)=>Point;point:()=>Point|undefined;effect:(e:SwarmEvent)=>void }
const actors=new Map<BotId,Entry>();
export const useMasterTick=create<{tick:number;receive:()=>void}>(set=>({tick:0,receive:()=>set(s=>({tick:s.tick+1}))}));
export function registerActor(id:BotId,entry:Entry) { actors.set(id,entry);return()=>{if(actors.get(id)===entry)actors.delete(id);entry.actor.stop();}; }
export function resetDirector(){actors.forEach(e=>{e.actor.stop();e.actor.x.set(20);e.actor.y.set(20);});clearFlights();}
let lastSocial:Partial<Record<BotId,number>>={};
export function direct(event:SwarmEvent,reduced:boolean,speed:number) {
  let id=eventBotId(event);if(event.type==='tool.result')id??=useDashboard.getState().state.calls[event.data.callId];
  if(!id)return;const entry=actors.get(id);if(!entry)return;const {actor,map}=entry;entry.effect(event);
  switch(event.type){
    case 'cursor.move':actor.glide(map(event.data),event.data.durationMs);break;
    case 'cursor.click':actor.click(map(event.data));sound(id,'click',speed);break;
    case 'cursor.type':actor.flourish('type');break;
    case 'cursor.scroll':actor.flourish('scroll');break;
    case 'bot.spawned':actor.hop();break;
    case 'board.delivered':actor.hop();break;
    case 'board.posted':case 'qa.bug':actor.flourish('found');sound(id,'found',speed);break;
    case 'bot.result':actor.flourish('finish');sound(id,'finish',speed);break;
    case 'bot.error':actor.flourish('error');break;
    case 'tool.called':if(useDashboard.getState().state.bots[id]?.emotes.current?.name==='retry')actor.flourish('retry');break;
    case 'approval.requested':sound(id,'approval',speed);break;
  }
  const isReport=['board.posted','qa.bug','approval.requested','bot.error','bot.result'].includes(event.type);
  const from=entry.point(),color=castFor(id).color;
  if(from&&['board.posted','qa.bug','bot.result','bot.error'].includes(event.type))burst({botId:id,...from,color,count:speed===4?6:PERSONALITY[id].sparkles,seed:hash(event.id),kind:event.type==='bot.error'?'smoke':event.type==='bot.result'?'confetti':'spark'});
  if(isReport&&from){const to=center(document.querySelector(`[data-master-row="${id}"]`));if(to){if(reduced)useMasterTick.getState().receive();else fly({id:event.id,botId:id,from,to,color,icon:event.type==='approval.requested'?'ask':event.type==='qa.bug'?'bug':event.type==='bot.result'?'note':event.type==='bot.error'?'dots':'spark',onLand:()=>useMasterTick.getState().receive()});}}
  if(from&&event.type==='board.delivered'){const board=center(document.querySelector('[data-board]'));if(board&&!reduced)fly({id:event.id,botId:id,from:board,to:from,color,icon:'plane'});}
  if(['bot.result','bot.error','approval.requested'].includes(event.type))for(const [other,peer]of actors){if(other===id||event.ts-(lastSocial[other]??-Infinity)<3000||peer.actor.isGliding())continue;const bot=useDashboard.getState().state.bots[other];if(!bot||bot.status==='paused')continue;const mood=bot.conditions.some(c=>['worried','failed'].includes(c.mood)&&(c.until===undefined||c.until>event.ts));if(mood)continue;lastSocial[other]=event.ts;if(event.type==='bot.result'&&!reduced)peer.actor.hop();}
}
