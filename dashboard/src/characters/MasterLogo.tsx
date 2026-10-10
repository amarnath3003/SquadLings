import { motion } from 'motion/react';
import { Icon } from './icons';
// Original coordinator glyph. The official Blossom is not redrawn or used as the project's logo.
export function MasterLogo({ state='idle', reduced=false, size=48, tick=0 }: {state?:string;reduced?:boolean;size?:number;tick?:number}) {
  const spinning=['planning','merging'].includes(state);
  return <div className={`master-logo master-${state}`} style={{width:size,height:size}}>
    <motion.svg viewBox="0 0 64 64" width={size} height={size} aria-label={`Master: ${state}`} role="img" animate={{rotate:reduced?0:spinning?[0,360]:tick*60,scale:reduced?1:state==='idle'?[1,1.025,1]:1}} transition={spinning?{duration:state==='merging'?0.8:1.2,repeat:Infinity,ease:'linear'}:{duration:state==='idle'?4:0.3,repeat:state==='idle'?Infinity:0}}>
      <circle cx="32" cy="32" r="29" fill={state==='idle'||state==='failed'?'none':'#0D0D0D'} stroke="#0D0D0D" strokeWidth="1.5"/>
      <g stroke={state==='idle'||state==='failed'?'#0D0D0D':'white'} fill="none" strokeWidth="2.5" strokeLinecap="round"><path d="M32 16v10M32 38v10M16 32h10M38 32h10M21 21l7 7M36 36l7 7M21 43l7-7M36 28l7-7"/><circle cx="32" cy="32" r="7"/></g>
    </motion.svg>
    {state==='needs you'&&<span className="master-ask"><Icon name="ask" size={14}/></span>}
  </div>;
}
