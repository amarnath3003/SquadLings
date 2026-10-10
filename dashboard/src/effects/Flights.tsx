import { create } from 'zustand';
import { motion } from 'motion/react';
import { arc } from '../director/geometry';
import type { Point } from '../mood/attention';
import type { BotId } from '@swarm/shared/types';
import { Icon, type IconName } from '../characters/icons';
interface Flight { id:string;botId:BotId;from:Point;to:Point;color:string;icon:IconName;onLand?:()=>void }
const useFlights=create<{items:Flight[];add:(f:Flight)=>void;remove:(id:string)=>void;clear:()=>void}>(set=>({items:[],add:f=>set(s=>({items:[...s.items.filter(x=>x.botId!==f.botId),f].slice(-6)})),remove:id=>set(s=>({items:s.items.filter(x=>x.id!==id)})),clear:()=>set({items:[]})}));
export const fly=(flight:Flight)=>useFlights.getState().add(flight);
export const clearFlights=()=>useFlights.getState().clear();
export function Flights({reduced,speed}:{reduced:boolean;speed:number}) {
  const items=useFlights(s=>s.items);
  return <div className="flights-layer" aria-hidden="true">{!reduced&&items.map(f=>{const points=arc(f.from,f.to);return <motion.div key={f.id} className="flight" style={{background:f.color}} initial={{x:f.from.x,y:f.from.y,opacity:1,scale:1}} animate={{x:points.map(p=>p.x),y:points.map(p=>p.y),scale:[1,0.6]}} transition={{duration:0.6/speed,ease:'easeInOut'}} onAnimationComplete={()=>{useFlights.getState().remove(f.id);f.onLand?.();}}><Icon name={f.icon} size={14}/></motion.div>;})}</div>;
}
