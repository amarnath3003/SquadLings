import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { BotId } from '@swarm/shared/types';
import type { SwarmEvent } from '@swarm/shared/events';
import { useDashboard } from '../store';
import { currentMood } from '../mood/engine';
import { BotCharacter } from '../characters/BotCharacter';
import { useBotActor } from '../characters/useBotActor';
import { Icon,STATUS_META,TOOL_META } from '../characters/icons';
import { registerActor } from '../director/director';
import { mapPoint,center } from '../director/geometry';
import { FrameCanvas } from './FrameCanvas';
export const BotTile=memo(function BotTile({id,reduced,speed,load,onFocus,focused,seed}:{id:BotId;reduced:boolean;speed:number;load:boolean;onFocus:(id:BotId)=>void;focused:boolean;seed:string}) {
  const bot=useDashboard(s=>s.state.bots[id]);
  const mood=useDashboard(s=>s.state.bots[id]?currentMood(s.state.bots[id]!.conditions,s.state.now):'calm');
  const actor=useBotActor(id,mood,reduced,speed,seed),viewportRef=useRef<HTMLDivElement>(null);
  const size=useRef({width:0,height:0}),logical=useRef({x:60,y:60});
  const [ripples,setRipples]=useState<{x:number;y:number;id:string}[]>([]),[target,setTarget]=useState<{x:number;y:number;width:number;height:number;id:string}>(),[trail,setTrail]=useState<{x:number;y:number;id:string}[]>([]);
  useEffect(()=>{if(!bot)return;const element=viewportRef.current!;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;size.current={width:r.width,height:r.height};const point=mapPoint(logical.current,bot.viewport,size.current);actor.x.set(point.x);actor.y.set(point.y);});observer.observe(element);return()=>observer.disconnect();},[actor,bot?.viewport]);
  useEffect(()=>{if(!bot)return;return registerActor(id,{actor,map:p=>{logical.current=p;return mapPoint(p,bot.viewport,size.current);},point:()=>{const r=viewportRef.current?.getBoundingClientRect();return r?{x:r.x+actor.x.get()+25,y:r.y+actor.y.get()+25}:undefined;},effect:event=>{
    if(event.type==='cursor.move'&&event.data.box){const box=event.data.box,p=mapPoint(box,bot.viewport,size.current),dimensions=mapPoint({x:box.width,y:box.height},bot.viewport,size.current);setTarget({...p,width:dimensions.x,height:dimensions.y,id:event.id});}
    if(event.type==='cursor.click'){const p=mapPoint(event.data,bot.viewport,size.current);setRipples(v=>[...v.slice(-2),{...p,id:event.id}]);setTrail(v=>[...v.slice(-3),{...p,id:event.id}]);}
    if(event.type==='page.navigated'){setTrail([]);setTarget(undefined);}
  }});},[id,actor,bot?.viewport]);
  useEffect(()=>{if(!target)return;const t=setTimeout(()=>setTarget(undefined),700/speed);return()=>clearTimeout(t);},[target,speed]);
  if(!bot)return null;
  const [statusIcon,statusText]=STATUS_META[bot.status],tool=bot.tool?TOOL_META[bot.tool]:undefined;
  const handlePointer=(e:React.PointerEvent)=>{if(!['calm','curious'].includes(mood)||actor.isGliding()||bot.status==='paused')return;const r=viewportRef.current!.getBoundingClientRect();actor.look({x:e.clientX-r.x,y:e.clientY-r.y});};
  return <motion.article className={`bot-tile status-${bot.status} ${focused?'tile-focused':''}`} style={{'--bot-color':bot.color} as React.CSSProperties} initial={{opacity:0,scale:reduced?1:0.96}} animate={{opacity:1,scale:1}} transition={{duration:0.3}} data-tile={id}>
    <header className="tile-header"><BotCharacter id={id} mood={mood} size={23} reduced/><div className="tile-title"><strong>{bot.name}</strong><span> / {bot.roleName}</span></div><button className="icon-button tile-focus" aria-label={`${focused?'Unfocus':'Focus'} ${bot.name}`} onClick={()=>onFocus(id)}><Icon name="scan" size={15}/></button><span className="status-pill"><Icon name={statusIcon} size={12}/>{statusText}</span></header>
    <div className={`viewport-shell ${bot.device==='mobile'?'phone-shell':''}`}><div className={`tile-viewport ${bot.device==='mobile'?'phone-screen':''}`} ref={viewportRef} onPointerMove={handlePointer} onPointerLeave={()=>actor.look()}>
      <FrameCanvas id={id} color={bot.color} load={load} phone={bot.device==='mobile'}/>
      <span className="simulation-watermark">SIMULATED</span>
      <div className="character-overlay">
        {target&&<motion.div key={target.id} className="target-box" style={{left:target.x,top:target.y,width:target.width,height:target.height,borderColor:bot.color}} initial={{opacity:0}} animate={{opacity:[0,1,0.6]}}/>}
        {!reduced&&ripples.map(p=><motion.div key={p.id} data-ripple={p.id} className="click-ripple" style={{left:p.x,top:p.y,borderColor:bot.color}} initial={{scale:0.2,opacity:0.8}} animate={{scale:2,opacity:0}} transition={{duration:0.45/speed}} onAnimationComplete={()=>setRipples(v=>v.filter(x=>x.id!==p.id))}/>)}
        {trail.map(p=><motion.i key={p.id} className="trail-dot" style={{left:p.x,top:p.y,background:bot.color}} initial={{opacity:0.5}} animate={{opacity:0}} transition={{duration:4/speed}}/>)}
        <motion.div className="actor-root" data-actor={id} style={{x:actor.x,y:actor.y,opacity:actor.opacity}}><BotCharacter id={id} mood={mood} size={44} reduced={reduced} speed={speed} actor={actor} pointer bubble={bot.emotes.current} label={focused?bot.roleName:undefined} seed={seed} interactive paused={bot.status==='paused'} edge={actor.y.get()<40?'top':actor.x.get()<40?'left':actor.x.get()>size.current.width-60?'right':undefined}/></motion.div>
        {bot.status==='paused'&&<div className="takeover-banner">Preview paused · no browser connected</div>}
        {bot.status==='failed'&&<div className="failed-veil"/>}
      </div>
    </div></div>
    <footer className="tile-caption"><p>{bot.caption}</p><div><span className="tile-host"><Icon name="globe" size={12}/>{bot.url?new URL(bot.url).hostname:'lab.example'}</span><span>{bot.steps}/{bot.maxSteps} steps</span></div></footer>
    <div className="activity-strip"><div>{bot.history.map((tool,i)=><span key={`${i}-${tool}`} style={{opacity:1-i*0.09}} title={TOOL_META[tool][1]}><Icon name={TOOL_META[tool][0]} size={12}/></span>)}</div><span>{tool&&<><Icon name={tool[0]} size={12}/>{tool[1]}</>}</span></div>
  </motion.article>;
});
