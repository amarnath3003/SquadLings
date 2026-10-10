import { memo, useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { BotId, Mood } from '@swarm/shared/types';
import { castFor } from '@swarm/shared/cast';
import { FACES } from './faces';
import { PERSONALITY, hash } from './personality';
import { useBotActor, type Actor } from './useBotActor';
import { Icon } from './icons';
import { EMOTES, type Bubble } from '../mood/emotes';
export interface CharacterProps { id: BotId; mood: Mood; size?: number; reduced?: boolean; speed?: number; pointer?: boolean; actor?: Actor; bubble?: Bubble; label?: string; seed?: string; interactive?: boolean; paused?: boolean; edge?: 'left' | 'top' | 'right'; }
export const BotCharacter = memo(function BotCharacter({ id, mood, size=80, reduced=false, speed=1, pointer=false, actor: supplied, bubble, label, seed='launch', interactive=false, paused=false, edge }: CharacterProps) {
  const cast=castFor(id), dna=PERSONALITY[id];
  const internal=useBotActor(id,mood,reduced,speed,seed), actor=supplied??internal;
  const [displayMood,setDisplayMood]=useState(mood), [booped,setBooped]=useState(false);
  useEffect(() => { if (reduced) { setDisplayMood(mood); return; } actor.blink.stop(); const playback=actor.blink; playback.set(1); const a=import('motion/react').then(({animate})=>animate(playback,[1,0.1,1],{duration:0.14/speed})); const timer=setTimeout(()=>setDisplayMood(mood),70/speed); return()=>{ clearTimeout(timer); void a.then(c=>c.stop()); }; },[mood,reduced,speed,actor]);
  useEffect(()=>{ if(!booped)return; const t=setTimeout(()=>setBooped(false),400);return()=>clearTimeout(t);},[booped]);
  const body = <><ellipse cx="32" cy="63" rx="19" ry="3" fill="#111" opacity=".08"/>
    <motion.g style={{y:actor.hopY,rotate:actor.tilt,scaleX:actor.scaleX,scaleY:actor.scaleY,originX:'32px',originY:'60px'}}>
      <g className={!reduced && ['calm','curious'].includes(mood)?'idle-float':''} style={{'--float':`${dna.float}px`,'--period':`${dna.period/speed}s`,'--delay':`${-(hash(seed+id)%3000)/1000}s`} as CSSProperties}>
        <circle cx="32" cy="32" r="32" fill="white"/><circle cx="32" cy="32" r="30" fill={cast.color}/>
        <motion.g style={{x:actor.eyeX,y:actor.eyeY}}><motion.g style={{scaleY:actor.blink,originX:'32px',originY:'30px'}}>{FACES[booped&&mood==='calm'?'happy':displayMood]}</motion.g></motion.g>
      </g>
    </motion.g></>;
  return <div className={`character ${pointer?'character-pointer':''}`} style={{width:size,height:size,opacity:1}} data-character={id}>
    {pointer&&<svg className="pointer-tip" width="18" height="18" viewBox="-2 -2 20 20"><path d="M0 0 L14 5 L5 14 Z" fill={cast.color} stroke="white" strokeWidth="2" strokeLinejoin="round"/></svg>}
    <div className="character-seat" style={{left:pointer?10:0,top:pointer?10:0}}>
      <svg viewBox="0 0 64 68" width={size} height={size*68/64} role="img" aria-label={`${cast.name}, ${booped?'happy':mood}`}>{body}</svg>
      {interactive&&!paused&&<button className="boop-target" aria-label={`Boop ${cast.name}`} title={`${cast.name} · ${cast.personality}. ${cast.line}`} onClick={e=>{e.stopPropagation();if(booped)return;setBooped(true);actor.click({x:actor.x.get(),y:actor.y.get()});}}/>}
      {(bubble||booped)&&<motion.div key={booped?'heart':bubble?.name} className={`speech-bubble ${edge?`bubble-${edge}`:''}`} initial={{scale:reduced?1:0.6,opacity:0}} animate={{scale:1,opacity:1}} transition={{duration:0.16/speed}} style={{borderColor:cast.color}}><Icon name={booped?'heart':EMOTES[bubble!.name].icon} size={17}/></motion.div>}
      {label&&<span className="name-pill" style={{borderColor:cast.color}}>{label}</span>}
    </div>
  </div>;
});
