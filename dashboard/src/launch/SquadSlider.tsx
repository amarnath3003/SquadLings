import { AnimatePresence, motion } from 'motion/react';
import { CAST } from '@swarm/shared/cast';
import { estimateRun } from '@swarm/shared/pricing';
import { BotCharacter } from '../characters/BotCharacter';
import { MasterLogo } from '../characters/MasterLogo';
import { Icon } from '../characters/icons';
import { ROLES,type TemplateId } from '../lab/fakeRun';
export function SquadSlider({count,onChange,template,reduced,disabled=false}:{count:number;onChange:(n:number)=>void;template:TemplateId;reduced:boolean;disabled?:boolean}) {
  return <section className="squad-builder" aria-labelledby="squad-heading">
    <div className="section-label"><span id="squad-heading">ASSEMBLE YOUR SQUAD</span><span className="muted">01 — 05</span></div>
    <div className="lineup"><div className="master-seat"><MasterLogo size={60} reduced={reduced}/><strong>Master</strong><span>The planner</span></div><div className="lineup-divider"/>
      {CAST.map((bot,i)=><div key={bot.id} className={`seat ${i>=count?'seat-empty':''}`}><div className="seat-art"><AnimatePresence mode="sync">{i<count?<motion.div key={bot.id} initial={{opacity:0,scale:reduced?1:0.4,y:reduced?0:-18}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:reduced?1:0.5,y:reduced?0:-10}} transition={{duration:reduced?0.15:0.45,ease:[0.22,1,0.36,1]}}><BotCharacter id={bot.id} mood={bot.signature} size={76} reduced={reduced} interactive/></motion.div>:<motion.div key="empty" className="empty-seat" initial={{opacity:0}} animate={{opacity:1}}><Icon name="plus" size={17}/></motion.div>}</AnimatePresence></div><strong>{bot.name}</strong><span>{ROLES[template][i]}</span></div>)}
    </div>
    <div className="slider-row"><button className="round-button" onClick={()=>onChange(Math.max(1,count-1))} disabled={disabled||count===1} aria-label="Remove a bot"><Icon name="minus" size={16}/></button>
      <div className="range-wrap"><input aria-label="Squad size" type="range" min="1" max="5" step="1" value={count} disabled={disabled} aria-valuetext={`${count} bots: ${CAST.slice(0,count).map(b=>b.name).join(', ')}`} onChange={e=>onChange(Number(e.target.value))} onKeyDown={e=>{if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();onChange(Math.max(1,Math.min(5,count+(e.key==='PageUp'?1:-1))));}}} style={{accentColor:CAST[count-1].color}}/><div className="range-ticks">{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}</div></div>
      <button className="round-button" onClick={()=>onChange(Math.min(5,count+1))} disabled={disabled||count===5} aria-label="Add a bot"><Icon name="plus" size={16}/></button>
    </div><div className="squad-summary"><span><strong>{count} little {count===1?'teammate':'teammates'}</strong><span className="summary-names"> · {CAST.slice(0,count).map(b=>b.name).join(', ')}</span></span><span title="Spec planning estimate only. The Lab costs $0.">est. ${estimateRun(count).toFixed(2)} / real run</span></div>
  </section>;
}
