import { useCallback, useEffect, useRef, useState } from 'react';
import { CAST } from '@swarm/shared/cast';
import type { BotId, Approval } from '@swarm/shared/types';
import type { EventData, EventType, SwarmEvent } from '@swarm/shared/events';
import { direct, resetDirector } from '../director/director';
import { useDashboard } from '../store';
import { fakeRun,makeEvent,ROLES,type TemplateId } from './fakeRun';
export function useLab(reduced:boolean,speed:number) {
  const [playing,setPlaying]=useState(false),[hasRun,setHasRun]=useState(false),[resultOpen,setResultOpen]=useState(false);
  const clock=useRef(1000),queue=useRef<SwarmEvent[]>([]),index=useRef(0),last=useRef(0),manualSeq=useRef(10000),active=useRef(false),end=useRef(0),cancelledApprovals=useRef(new Set<string>());
  const options=useRef({reduced,speed});options.current={reduced,speed};
  const dispatch=useCallback((event:SwarmEvent)=>{direct(event,options.current.reduced,options.current.speed);useDashboard.getState().dispatch(event);if(event.type==='run.result')setResultOpen(true);},[]);
  const fire=useCallback(<T extends EventType>(type:T,data:EventData[T],botId?:BotId)=>{dispatch(makeEvent(type,data,clock.current,++manualSeq.current,botId));},[dispatch]);
  useEffect(()=>{const timer=setInterval(()=>{
    const now=performance.now(),delta=last.current?Math.min(200,now-last.current):0;last.current=now;
    if(document.hidden)return;
    clock.current+=delta*options.current.speed;
    if(active.current){while(index.current<queue.current.length&&queue.current[index.current].ts<=clock.current){const event=queue.current[index.current++];if(event.type==='approval.resolved'&&cancelledApprovals.current.has(event.data.approvalId))continue;dispatch(event);}if(index.current===queue.current.length){active.current=false;setPlaying(false);}}
    useDashboard.getState().tick(clock.current);
  },100);return()=>clearInterval(timer);},[dispatch]);
  const start=useCallback((seed:string,count:number,template:TemplateId,mobile:boolean)=>{
    active.current=false;useDashboard.getState().reset();resetDirector();clock.current=1000;last.current=performance.now();index.current=0;cancelledApprovals.current.clear();setResultOpen(false);
    queue.current=fakeRun(seed,count,template,mobile);end.current=queue.current.at(-1)!.ts;active.current=true;setHasRun(true);setPlaying(true);
  },[]);
  const stop=useCallback(()=>{active.current=false;queue.current=[];setPlaying(false);for(const bot of Object.values(useDashboard.getState().state.bots))if(bot&&!['finished','failed','stopped'].includes(bot.status))fire('bot.status',{botId:bot.id,status:'stopped'},bot.id);resetDirector();fire('run.status',{status:'cancelled'});},[fire]);
  const reset=useCallback(()=>{active.current=false;queue.current=[];setPlaying(false);setHasRun(false);setResultOpen(false);resetDirector();useDashboard.getState().reset();},[]);
  const spawn=useCallback((id:BotId,template:TemplateId,mobile:boolean)=>{if(useDashboard.getState().state.bots[id])return;const cast=CAST.find(b=>b.id===id)!,i=CAST.indexOf(cast),phone=mobile&&id==='bot3';fire('bot.spawned',{botId:id,name:cast.name,color:cast.color,roleId:`role${i}`,roleName:ROLES[template][i],goal:'Manual character experiment.',viewport:phone?{width:390,height:844}:{width:1280,height:800},device:phone?'mobile':'desktop'},id);fire('bot.status',{botId:id,status:'thinking'},id);},[fire]);
  const resolve=useCallback((approval:Approval,status:'approved'|'skipped')=>{cancelledApprovals.current.add(approval.id);fire('approval.resolved',{approvalId:approval.id,status,by:'user'});},[fire]);
  return {playing,hasRun,resultOpen,setResultOpen,start,stop,reset,fire,spawn,resolve};
}
